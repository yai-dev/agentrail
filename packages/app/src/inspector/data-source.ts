/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { WorkflowTraceEventEnvelope } from "@/events/index.js";
import { createFileSystemSessionTraceStore } from "@/session/trace-store.js";
import {
  createFilesystemOrchestrationPersistence,
  type RecoveredOrchestrationState,
} from "@agentrail/capabilities";
import type { Message } from "@agentrail/core";
import { createSessionRef } from "@agentrail/core";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// ─── Public contract ──────────────────────────────────────────────────────────

/** Lightweight session descriptor returned by `listSessions`. */
export interface InspectorSessionItem {
  tenantId: string;
  sessionId: string;
  userId?: string;
  lastActive?: string;
  turns?: number;
  tokens?: number;
  status?: "idle" | "error";
}

/**
 * Read-side abstraction consumed by `createInspectorRoute`.
 *
 * The default filesystem implementation (`createFilesystemInspectorDataSource`)
 * reads directly from the layout produced by `SessionManager`.  Custom storage
 * backends should provide their own implementation of this interface and pass it
 * to `createInspectorRoute` or `createAgentApp({ inspector: <dataSource> })`.
 *
 * @see {@link https://agentrail.run/reference/inspector-route}
 */
export interface InspectorDataSource {
  /** List all sessions across all tenants, enriched with metadata. */
  listSessions(): Promise<InspectorSessionItem[]>;

  /** Load the raw message history for a session. */
  loadMessages(tenantId: string, sessionId: string): Promise<Message[]>;

  /** Load merged runtime + orchestration trace envelopes for a session. */
  loadTraceEnvelopes(tenantId: string, sessionId: string): Promise<WorkflowTraceEventEnvelope[]>;

  /** Load the current orchestration state snapshot for a session. */
  loadOrchestrationState(
    tenantId: string,
    sessionId: string,
  ): Promise<RecoveredOrchestrationState | null>;

  /** Load the raw orchestration events for a session (for the trace timeline). */
  loadOrchestrationEvents(tenantId: string, sessionId: string): Promise<unknown[]>;
}

// ─── Filesystem implementation ────────────────────────────────────────────────

async function enrichSession(
  dataDir: string,
  tenantId: string,
  sessionId: string,
): Promise<Pick<InspectorSessionItem, "userId" | "lastActive" | "turns" | "tokens" | "status">> {
  const sessionDir = path.join(dataDir, "tenants", tenantId, "sessions", sessionId);
  const sessionFile = path.join(sessionDir, "session.jsonl");
  const traceFile = path.join(sessionDir, "trace", "events.jsonl");

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
    // session.jsonl not yet written
  }

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

  const finalTurns = turns > 0 ? turns : traceTurns > 0 ? traceTurns : undefined;

  return {
    userId,
    lastActive,
    turns: finalTurns,
    tokens: tokens > 0 ? tokens : undefined,
    status: hasError ? "error" : "idle",
  };
}

/**
 * Creates the default filesystem-backed `InspectorDataSource` from a `dataDir`
 * that uses the layout produced by `SessionManager`.
 */
export function createFilesystemInspectorDataSource(dataDir: string): InspectorDataSource {
  return {
    async listSessions(): Promise<InspectorSessionItem[]> {
      const tenantsRoot = path.join(dataDir, "tenants");
      const items: InspectorSessionItem[] = [];

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

      items.sort((a, b) => {
        if (a.lastActive && b.lastActive) return b.lastActive.localeCompare(a.lastActive);
        if (a.lastActive) return -1;
        if (b.lastActive) return 1;
        return a.sessionId.localeCompare(b.sessionId);
      });

      return items;
    },

    async loadMessages(tenantId: string, sessionId: string): Promise<Message[]> {
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
            return JSON.parse(l) as Message;
          } catch {
            return null;
          }
        })
        .filter((m): m is Message => m !== null);
    },

    async loadTraceEnvelopes(
      tenantId: string,
      sessionId: string,
    ): Promise<WorkflowTraceEventEnvelope[]> {
      const sessionRef = createSessionRef(tenantId, sessionId);
      const traceStore = createFileSystemSessionTraceStore<WorkflowTraceEventEnvelope>(
        dataDir,
        sessionRef,
      );
      return traceStore.loadEnvelopes();
    },

    async loadOrchestrationState(
      tenantId: string,
      sessionId: string,
    ): Promise<RecoveredOrchestrationState | null> {
      const sessionRef = createSessionRef(tenantId, sessionId);
      const persistence = createFilesystemOrchestrationPersistence(dataDir, sessionRef);
      try {
        return await persistence.recoverState();
      } catch {
        return null;
      }
    },

    async loadOrchestrationEvents(tenantId: string, sessionId: string): Promise<unknown[]> {
      const sessionRef = createSessionRef(tenantId, sessionId);
      const persistence = createFilesystemOrchestrationPersistence(dataDir, sessionRef);
      try {
        return await persistence.loadEvents();
      } catch {
        return [];
      }
    },
  };
}
