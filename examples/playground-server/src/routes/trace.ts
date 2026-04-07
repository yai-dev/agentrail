/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { mapOrchestrationEvent, type WorkflowTraceEventEnvelope } from "@agentrail/app";
import { createFileSystemSessionTraceStore } from "@agentrail/app";
import { createSessionRef } from "@agentrail/core";
import { createFilesystemOrchestrationPersistence } from "@agentrail/capabilities";
import { Hono } from "hono";
import { config } from "../config.js";

const trace = new Hono();

/** GET /api/sessions/:sessionId/trace?tenantId=...
 *  Returns the merged runtime + orchestration trace for a session.
 *  Gracefully returns partial data (or empty) when either source is missing.
 */
trace.get("/:sessionId/trace", async (c) => {
  const { sessionId } = c.req.param();
  const tenantId = c.req.query("tenantId") ?? "default";
  const sessionRef = createSessionRef(tenantId, sessionId);
  const persistence = createFilesystemOrchestrationPersistence(config.dataDir, sessionRef);
  const traceStore = createFileSystemSessionTraceStore<WorkflowTraceEventEnvelope>(
    config.dataDir,
    sessionRef,
  );

  const [runtimeEnvelopes, orchestrationEvents] = await Promise.all([
    traceStore.loadEnvelopes(),
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

export { trace };
