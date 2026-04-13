/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { mapOrchestrationEvent, type WorkflowTraceEventEnvelope } from "@/events/index.js";
import type { InspectorDataSource } from "@/inspector/data-source.js";
import { Hono } from "hono";

export { createFilesystemInspectorDataSource } from "@/inspector/data-source.js";
export type { InspectorDataSource, InspectorSessionItem } from "@/inspector/data-source.js";

// ─── Route factory ────────────────────────────────────────────────────────────

/**
 * Creates the Agentrail Inspector API routes backed by an `InspectorDataSource`.
 *
 * The returned Hono sub-app uses **relative paths** and must be mounted by the
 * host at the desired prefix:
 *
 * ```ts
 * import { createFilesystemInspectorDataSource } from "@agentrail/app/advanced";
 * app.route("/__inspector", createInspectorRoute(createFilesystemInspectorDataSource(dataDir)));
 * ```
 *
 * Exposed endpoints (all relative to the mount point):
 * - `GET /sessions`                          — list all sessions (enriched)
 * - `GET /sessions/:sessionId/trace`         — merged runtime + orchestration trace
 * - `GET /sessions/:sessionId/orchestration` — orchestration state snapshot
 * - `GET /sessions/:sessionId/messages`      — raw message history (for Context Diff)
 * - `GET /health`                            — lightweight liveness check
 *
 * @see {@link https://agentrail.run/reference/inspector-route}
 */
export function createInspectorRoute(dataSource: InspectorDataSource): Hono {
  const source: InspectorDataSource = dataSource;

  const route = new Hono();

  // ── Liveness ──────────────────────────────────────────────────────────────
  route.get("/health", (c) => c.json({ status: "ok" }));

  // ── Session list (enriched) ────────────────────────────────────────────────
  route.get("/sessions", async (c) => {
    try {
      const sessions = await source.listSessions();
      return c.json({ sessions });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Trace ─────────────────────────────────────────────────────────────────
  route.get("/sessions/:sessionId/trace", async (c) => {
    const { sessionId } = c.req.param();
    const tenantId = c.req.query("tenantId") ?? "default";

    try {
      const [runtimeEnvelopes, orchestrationEvents] = await Promise.all([
        source.loadTraceEnvelopes(tenantId, sessionId),
        source.loadOrchestrationEvents(tenantId, sessionId).catch(() => []),
      ]);

      const baseSeq = runtimeEnvelopes.length;
      const orchestrationEnvelopes: WorkflowTraceEventEnvelope[] = (
        orchestrationEvents as Parameters<typeof mapOrchestrationEvent>[0][]
      ).flatMap((event, i) => {
        const mapped = mapOrchestrationEvent(event);
        if (!mapped) return [];
        return [
          {
            id: `orchestration-${(event as { eventId?: string }).eventId ?? i}-${i}`,
            timestamp: (event as { occurredAt?: string }).occurredAt ?? new Date().toISOString(),
            sequence: baseSeq + i,
            source: "orchestration" as const,
            event: mapped as unknown as Record<string, unknown>,
          },
        ];
      });

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
      const messages = await source.loadMessages(tenantId, sessionId);
      return c.json({ messages });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ── Orchestration state ───────────────────────────────────────────────────
  route.get("/sessions/:sessionId/orchestration", async (c) => {
    const { sessionId } = c.req.param();
    const tenantId = c.req.query("tenantId") ?? "default";

    try {
      const [state, events] = await Promise.all([
        source.loadOrchestrationState(tenantId, sessionId),
        source.loadOrchestrationEvents(tenantId, sessionId),
      ]);

      const snapshot = state?.snapshot;
      const agents = Object.values(
        snapshot?.agents ?? {},
      ) as import("@agentrail/capabilities").OrchestrationAgent[];

      const activeRun = snapshot
        ? (Object.values(snapshot.runs).find(
            (r) => (r as { status?: string }).status === "running",
          ) ?? Object.values(snapshot.runs)[0])
        : undefined;
      const activeRunTyped = activeRun as
        | { id: string; status: string; createdAt: string; updatedAt: string }
        | undefined;

      return c.json({
        run: activeRunTyped
          ? {
              id: activeRunTyped.id,
              status: activeRunTyped.status,
              createdAt: activeRunTyped.createdAt,
              updatedAt: activeRunTyped.updatedAt,
            }
          : null,
        agents: agents.map((agent) => ({
          id: agent.id,
          displayName: agent.displayName,
          role: agent.role,
          status: agent.status,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
          closedAt: agent.closedAt,
          lastJob: agent.lastJob,
        })),
        events,
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  return route;
}
