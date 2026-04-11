/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { mapOrchestrationEvent, type WorkflowTraceEventEnvelope } from "@/events/index.js";
import { createFileSystemSessionTraceStore } from "@/session/trace-store.js";
import { createFilesystemOrchestrationPersistence } from "@agentrail/capabilities";
import { createSessionRef } from "@agentrail/core";
import { Hono } from "hono";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// ─── Session listing ──────────────────────────────────────────────────────────

interface SessionListItem {
  tenantId: string;
  sessionId: string;
  userId?: string;
  lastActive?: string;
  turns?: number;
  tokens?: number;
  status?: "idle" | "error";
}

/**
 * Derives session metadata by reading both session.jsonl (for userId, tokens,
 * and turn count) and the trace events.jsonl (for lastActive timestamp and
 * error detection). Uses session.jsonl as the authoritative source for turn
 * and token counts since the trace only records agent-level events.
 */
async function enrichSession(
  dataDir: string,
  tenantId: string,
  sessionId: string,
): Promise<Pick<SessionListItem, "userId" | "lastActive" | "turns" | "tokens" | "status">> {
  const sessionDir = path.join(dataDir, "tenants", tenantId, "sessions", sessionId);
  const sessionFile = path.join(sessionDir, "session.jsonl");
  const traceFile = path.join(sessionDir, "trace", "events.jsonl");

  // ── Read session.jsonl for userId, tokens, and turn count ─────────────────
  let userId: string | undefined;
  let turns = 0;
  let tokens = 0;

  try {
    const sessionRaw = await readFile(sessionFile, "utf8");
    for (const line of sessionRaw.split("\n")) {
      if (!line.trim()) continue;
      let record: Record<string, unknown>;
      try {
        record = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      const type = String(record["type"] ?? "");
      if (type === "init") {
        const uid = record["userId"];
        if (typeof uid === "string" && uid) userId = uid;
        else if (typeof uid === "number") userId = String(uid);
      } else if (type === "turn") {
        turns++;
        const inp = typeof record["inputTokens"] === "number" ? record["inputTokens"] : 0;
        const out = typeof record["outputTokens"] === "number" ? record["outputTokens"] : 0;
        tokens += inp + out;
      }
    }
  } catch {
    // session.jsonl not yet written — fall through to trace-based counting
  }

  // ── Read trace events.jsonl for lastActive timestamp and errors ───────────
  let lastActive: string | undefined;
  let hasError = false;
  let traceTurns = 0;

  try {
    const traceRaw = await readFile(traceFile, "utf8");
    for (const line of traceRaw.split("\n")) {
      if (!line.trim()) continue;
      let envelope: Record<string, unknown>;
      try {
        envelope = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      const ts = envelope["timestamp"];
      if (typeof ts === "string" && (!lastActive || ts > lastActive)) {
        lastActive = ts;
      }
      const event = (envelope["event"] ?? {}) as Record<string, unknown>;
      const type = String(event["type"] ?? "");
      if (type === "turn_end" || type === "turn.complete") traceTurns++;
      if (type === "error") hasError = true;
    }
  } catch {
    // trace not yet written
  }

  // session.jsonl turn count is authoritative; fall back to trace if missing
  const finalTurns = turns > 0 ? turns : traceTurns > 0 ? traceTurns : undefined;

  return {
    userId,
    lastActive,
    turns: finalTurns,
    tokens: tokens > 0 ? tokens : undefined,
    status: hasError ? "error" : "idle",
  };
}

async function listSessions(dataDir: string): Promise<SessionListItem[]> {
  const tenantsRoot = path.join(dataDir, "tenants");
  const items: SessionListItem[] = [];

  let tenantDirs: string[];
  try {
    const entries = await readdir(tenantsRoot, { withFileTypes: true });
    tenantDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }

  await Promise.all(
    tenantDirs.map(async (tenantId) => {
      const sessionsRoot = path.join(tenantsRoot, tenantId, "sessions");
      try {
        const entries = await readdir(sessionsRoot, { withFileTypes: true });
        await Promise.all(
          entries
            .filter((e) => e.isDirectory())
            .map(async (e) => {
              const meta = await enrichSession(dataDir, tenantId, e.name);
              items.push({ tenantId, sessionId: e.name, ...meta });
            }),
        );
      } catch {
        // no sessions for this tenant yet
      }
    }),
  );

  // Sort newest-first by lastActive, then alphabetically
  items.sort((a, b) => {
    if (a.lastActive && b.lastActive) return b.lastActive.localeCompare(a.lastActive);
    if (a.lastActive) return -1;
    if (b.lastActive) return 1;
    return a.sessionId.localeCompare(b.sessionId);
  });

  return items;
}

// ─── Session messages ─────────────────────────────────────────────────────────

async function loadSessionMessages(
  dataDir: string,
  tenantId: string,
  sessionId: string,
): Promise<unknown[]> {
  const file = path.join(dataDir, "tenants", tenantId, "sessions", sessionId, "messages.jsonl");
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return [];
  }
  return raw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      try {
        return JSON.parse(l) as unknown;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// ─── Route factory ────────────────────────────────────────────────────────────

/**
 * Creates the Agentrail Inspector API routes.
 *
 * The returned Hono sub-app uses **relative paths** and must be mounted by the
 * host at the desired prefix:
 *
 * ```ts
 * app.route("/__inspector", createInspectorRoute(dataDir));
 * ```
 *
 * Exposed endpoints (all relative to the mount point):
 * - `GET /sessions`                          — list all sessions (enriched)
 * - `GET /sessions/:sessionId/trace`         — merged runtime + orchestration trace
 * - `GET /sessions/:sessionId/orchestration` — orchestration state snapshot
 * - `GET /sessions/:sessionId/messages`      — raw message history (for Context Diff)
 * - `GET /health`                            — lightweight liveness check
 *
 * **MVP limitation:** this route reads directly from the filesystem data
 * layout produced by `SessionManager` and
 * `createFilesystemOrchestrationPersistence`. It is not compatible with custom
 * session store implementations.
 *
 * @see {@link https://agentrail.run/reference/inspector-route}
 */
export function createInspectorRoute(dataDir: string): Hono {
  const route = new Hono();

  // ── Liveness ──────────────────────────────────────────────────────────────
  route.get("/health", (c) => c.json({ status: "ok" }));

  // ── Session list (enriched) ────────────────────────────────────────────────
  route.get("/sessions", async (c) => {
    try {
      const sessions = await listSessions(dataDir);
      return c.json({ sessions });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Trace ─────────────────────────────────────────────────────────────────
  route.get("/sessions/:sessionId/trace", async (c) => {
    const { sessionId } = c.req.param();
    const tenantId = c.req.query("tenantId") ?? "default";
    const sessionRef = createSessionRef(tenantId, sessionId);

    const persistence = createFilesystemOrchestrationPersistence(dataDir, sessionRef);
    const traceStore = createFileSystemSessionTraceStore<WorkflowTraceEventEnvelope>(
      dataDir,
      sessionRef,
    );

    try {
      const [runtimeEnvelopes, orchestrationEvents] = await Promise.all([
        traceStore.loadEnvelopes(),
        persistence.loadEvents().catch(() => []),
      ]);

      const baseSeq = runtimeEnvelopes.length;
      const orchestrationEnvelopes: WorkflowTraceEventEnvelope[] = orchestrationEvents.flatMap(
        (event, i) => {
          const mapped = mapOrchestrationEvent(event);
          if (!mapped) return [];
          return [
            {
              id: `orchestration-${event.eventId}-${i}`,
              timestamp: event.occurredAt,
              sequence: baseSeq + i,
              source: "orchestration" as const,
              event: mapped as unknown as Record<string, unknown>,
            },
          ];
        },
      );

      const merged = [...runtimeEnvelopes, ...orchestrationEnvelopes].sort((a, b) => {
        const tDiff = a.timestamp.localeCompare(b.timestamp);
        return tDiff !== 0 ? tDiff : a.sequence - b.sequence;
      });

      return c.json({ events: merged });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Messages (for Context Diff) ────────────────────────────────────────────
  route.get("/sessions/:sessionId/messages", async (c) => {
    const { sessionId } = c.req.param();
    const tenantId = c.req.query("tenantId") ?? "default";
    try {
      const messages = await loadSessionMessages(dataDir, tenantId, sessionId);
      return c.json({ messages });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Orchestration state ───────────────────────────────────────────────────
  route.get("/sessions/:sessionId/orchestration", async (c) => {
    const { sessionId } = c.req.param();
    const tenantId = c.req.query("tenantId") ?? "default";
    const sessionRef = createSessionRef(tenantId, sessionId);

    try {
      const persistence = createFilesystemOrchestrationPersistence(dataDir, sessionRef);
      const [{ snapshot }, events] = await Promise.all([
        persistence.recoverState(),
        persistence.loadEvents(),
      ]);

      const agents = Object.values(snapshot?.agents ?? {});
      const agentStates = await Promise.all(
        agents.map(async (agent) => ({
          agent,
          mailboxState: await persistence.loadMailboxState(agent.id),
        })),
      );

      const activeRun = snapshot
        ? (Object.values(snapshot.runs).find((r) => r.status === "running") ??
          Object.values(snapshot.runs)[0])
        : undefined;

      return c.json({
        run: activeRun
          ? {
              id: activeRun.id,
              status: activeRun.status,
              createdAt: activeRun.createdAt,
              updatedAt: activeRun.updatedAt,
            }
          : null,
        agents: agentStates.map(({ agent, mailboxState }) => ({
          id: agent.id,
          displayName: agent.displayName,
          role: agent.role,
          status: agent.status,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
          closedAt: agent.closedAt,
          lastJob: agent.lastJob,
          mailbox: {
            processedEventCount: mailboxState.processedEventCount,
            closeRequested: mailboxState.closeRequested,
          },
        })),
        events,
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  return route;
}
