/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { mapOrchestrationEvent, type WorkflowTraceEventEnvelope } from "@agentrail/events";
import { createSessionRef } from "@agentrail/memo";
import { createFilesystemOrchestrationPersistence } from "@agentrail/orchestration";
import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { sessionManager } from "../context/index.js";

const trace = new Hono();

/** GET /api/sessions/:sessionId/trace?tenantId=...
 *  Returns the merged runtime + orchestration trace for a session.
 *  Gracefully returns partial data (or empty) when either source is missing.
 */
trace.get("/:sessionId/trace", async (c) => {
  const { sessionId } = c.req.param();
  const tenantId = c.req.query("tenantId") ?? "default";
  const sessionRef = createSessionRef(tenantId, sessionId);

  const { tenantId: resolvedTenantId, sessionId: resolvedSessionId } =
    sessionManager.resolveSessionRef(sessionRef);
  const sessionDir = sessionManager.getSessionDir(resolvedTenantId, resolvedSessionId);
  const persistence = createFilesystemOrchestrationPersistence(config.dataDir, sessionRef);

  const [runtimeEnvelopes, orchestrationEvents] = await Promise.all([
    loadRuntimeEnvelopes(sessionDir),
    persistence.loadEvents().catch(() => []),
  ]);

  // Map orchestration events to envelopes, assigning sequence after runtime
  const baseSeq = runtimeEnvelopes.length;
  const orchestrationEnvelopes: WorkflowTraceEventEnvelope[] = orchestrationEvents.flatMap(
    (event, i) => {
      const mapped = mapOrchestrationEvent(event);
      if (!mapped) return [];
      const envelope: WorkflowTraceEventEnvelope = {
        id: `orchestration-${event.eventId}-${i}`,
        timestamp: event.occurredAt,
        sequence: baseSeq + i,
        source: "orchestration",
        event: mapped as unknown as Record<string, unknown>,
      };
      return [envelope];
    },
  );

  const merged = [...runtimeEnvelopes, ...orchestrationEnvelopes].sort((a, b) => {
    const tDiff = a.timestamp.localeCompare(b.timestamp);
    return tDiff !== 0 ? tDiff : a.sequence - b.sequence;
  });

  return c.json({ events: merged });
});

async function loadRuntimeEnvelopes(sessionDir: string): Promise<WorkflowTraceEventEnvelope[]> {
  const traceFile = path.join(sessionDir, "trace", "events.jsonl");
  try {
    const contents = await readFile(traceFile, "utf8");
    return contents
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as WorkflowTraceEventEnvelope);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export { trace };
