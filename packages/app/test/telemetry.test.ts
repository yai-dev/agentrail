/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it } from "vitest";
import { TRACE_PERSISTED_EVENT_TYPES, wrapTraceEvent } from "../src/events/index.js";
import type { TelemetrySink, TelemetrySinkEvent } from "../src/telemetry/sink.js";

// ─── TRACE_PERSISTED_EVENT_TYPES ──────────────────────────────────────────────

describe("TRACE_PERSISTED_EVENT_TYPES", () => {
  // These are the synthetic lifecycle events emitted by chat-route. They were
  // missing from the set, causing /chat telemetry sinks to receive only error
  // events — the regression this test guards against.
  it("includes agent_start and agent_end", () => {
    expect(TRACE_PERSISTED_EVENT_TYPES.has("agent_start")).toBe(true);
    expect(TRACE_PERSISTED_EVENT_TYPES.has("agent_end")).toBe(true);
  });

  it("includes core runtime event types", () => {
    for (const type of [
      "session.start",
      "session.end",
      "turn.start",
      "turn.complete",
      "tool.before",
      "tool.after",
      "error",
    ]) {
      expect(TRACE_PERSISTED_EVENT_TYPES.has(type), `missing: ${type}`).toBe(true);
    }
  });

  it("does not include high-frequency streaming noise events", () => {
    for (const type of [
      "message_start",
      "message_end",
      "message_update",
      "session_id",
      "text_delta",
    ]) {
      expect(TRACE_PERSISTED_EVENT_TYPES.has(type), `should be absent: ${type}`).toBe(false);
    }
  });
});

// ─── wrapTraceEvent ───────────────────────────────────────────────────────────

describe("wrapTraceEvent", () => {
  it("assigns a unique id for every call even with the same traceId", () => {
    const traceId = "req-abc-123";
    const e1 = wrapTraceEvent("runtime", { type: "turn.start" }, 0, traceId);
    const e2 = wrapTraceEvent("runtime", { type: "turn.complete" }, 1, traceId);

    expect(e1.id).not.toBe(e2.id);
    expect(e1.traceId).toBe(traceId);
    expect(e2.traceId).toBe(traceId);
  });

  it("does not set traceId when the argument is omitted", () => {
    const envelope = wrapTraceEvent("runtime", { type: "turn.start" }, 0);
    expect(envelope.traceId).toBeUndefined();
  });

  it("sets source and event correctly", () => {
    const event = { type: "tool.before", name: "search" };
    const envelope = wrapTraceEvent("orchestration", event, 5);
    expect(envelope.source).toBe("orchestration");
    expect(envelope.event).toBe(event);
    expect(envelope.sequence).toBe(5);
  });
});

// ─── TelemetrySink flush contract ─────────────────────────────────────────────

describe("TelemetrySink flush contract", () => {
  let emittedEvents: TelemetrySinkEvent[];
  let flushCallCount: number;

  const makeSink = (): TelemetrySink => {
    emittedEvents = [];
    flushCallCount = 0;
    return {
      emit(event) {
        emittedEvents.push(event);
      },
      async flush() {
        flushCallCount++;
      },
    };
  };

  it("emit receives a consistent traceId across all events in a request", () => {
    const sink = makeSink();
    const traceId = "stable-trace-id";
    const events = [
      wrapTraceEvent("runtime", { type: "turn.start" }, 0, traceId),
      wrapTraceEvent("runtime", { type: "tool.before" }, 1, traceId),
      wrapTraceEvent("runtime", { type: "turn.complete" }, 2, traceId),
    ];

    for (const env of events) {
      void sink.emit({
        traceId: env.traceId ?? env.id,
        sessionId: "s1",
        tenantId: "t1",
        timestamp: env.timestamp,
        sequence: env.sequence,
        source: env.source,
        event: env.event,
      });
    }

    expect(emittedEvents).toHaveLength(3);
    const traceIds = emittedEvents.map((e) => e.traceId);
    expect(new Set(traceIds).size).toBe(1);
    expect(traceIds[0]).toBe(traceId);
  });

  it("all emitted envelope ids are unique even when traceId is shared", () => {
    const traceId = "shared-trace";
    const envelopes = Array.from({ length: 5 }, (_, i) =>
      wrapTraceEvent("runtime", { type: "turn.start" }, i, traceId),
    );
    const ids = envelopes.map((e) => e.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("flush() is invocable and resolves without error", async () => {
    const sink = makeSink();
    await sink.flush!();
    expect(flushCallCount).toBe(1);
  });
});
