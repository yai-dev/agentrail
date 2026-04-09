/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { randomUUID } from "node:crypto";
import { createSessionRef } from "@agentrail/core";
import { createFileSystemSessionTraceStore } from "@/session/trace-store.js";

// ─── Core interface ───────────────────────────────────────────────────────────

/**
 * A single telemetry event emitted by the Agentrail host runtime.
 * Carries correlation identifiers so consumers can join events across sessions,
 * tenants, and request traces without additional lookups.
 */
export interface TelemetrySinkEvent {
  /** Unique identifier for the originating request chain. */
  traceId: string;
  /** Session this event belongs to. */
  sessionId: string;
  /** Tenant this event belongs to. */
  tenantId: string;
  /** ISO-8601 timestamp of the event. */
  timestamp: string;
  /** Monotonically increasing counter within a single request. */
  sequence: number;
  /**
   * Where the event originated.
   * - `"runtime"` — agent loop events (turn, tool, compaction, …)
   * - `"orchestration"` — multi-agent coordination events
   * - `"host"` — framework-level events emitted by the chat/stream routes
   */
  source: "runtime" | "orchestration" | "host";
  /** Raw event payload. Shape matches the corresponding `AgentrailEvent` subtype. */
  event: Record<string, unknown>;
}

/**
 * Pluggable sink that receives telemetry events from the Agentrail runtime.
 *
 * Pass an implementation via `CreateAgentAppOptions.telemetrySink`. The
 * framework ships two built-in sinks: `createConsoleTelemetrySink` for local
 * development and `createFileTelemetrySink` for filesystem-backed persistence.
 *
 * Third-party sinks (OpenTelemetry, Datadog, etc.) implement this interface.
 *
 * @see {@link https://agentrail.run/reference/telemetry-sink}
 */
export interface TelemetrySink {
  /**
   * Called for each telemetry event. May be async; errors are swallowed by the
   * framework so a failing sink never breaks the request pipeline.
   */
  emit(event: TelemetrySinkEvent): void | Promise<void>;

  /**
   * Optional hook called by the framework at the end of each HTTP request to
   * drain any in-memory write buffer before the response is finalised.
   *
   * **Shutdown flush is the host application's responsibility.** The framework
   * does not install process signal handlers. Wire this into your own shutdown
   * sequence, for example:
   * ```ts
   * process.once("SIGTERM", async () => {
   *   await telemetrySink.flush?.();
   *   process.exit(0);
   * });
   * ```
   */
  flush?(): Promise<void>;
}

// ─── Built-in: console sink ──────────────────────────────────────────────────

/**
 * Development sink that pretty-prints each event to the console.
 * Not recommended for production — use `createFileTelemetrySink` instead.
 */
export function createConsoleTelemetrySink(): TelemetrySink {
  return {
    emit(event: TelemetrySinkEvent): void {
      const label = `[telemetry] ${event.source} › ${String(event.event["type"] ?? "?")}`;
      console.log(label, {
        traceId: event.traceId,
        sessionId: event.sessionId,
        tenantId: event.tenantId,
        seq: event.sequence,
      });
    },
  };
}

// ─── Built-in: filesystem sink ───────────────────────────────────────────────

/**
 * Production-ready sink that appends events to per-session JSONL trace files
 * under `dataDir`. Uses the same layout as `createFileSystemSessionTraceStore`.
 *
 * Stores are created lazily on first write and cached for the lifetime of the
 * process. The cache is intentionally unbounded — sessions accumulate but the
 * objects are tiny.
 */
export function createFileTelemetrySink(dataDir: string): TelemetrySink {
  const stores = new Map<string, ReturnType<typeof createFileSystemSessionTraceStore>>();

  function getStore(tenantId: string, sessionId: string) {
    const key = `${tenantId}\x00${sessionId}`;
    if (!stores.has(key)) {
      const ref = createSessionRef(tenantId, sessionId);
      stores.set(key, createFileSystemSessionTraceStore(dataDir, ref));
    }
    return stores.get(key)!;
  }

  return {
    async emit(event: TelemetrySinkEvent): Promise<void> {
      const store = getStore(event.tenantId, event.sessionId);
      await store.appendEnvelope({
        // Per-event unique id — must not be reused across events from the
        // same request, as the trace UI uses it as a dedup and React key.
        id: randomUUID(),
        timestamp: event.timestamp,
        sequence: event.sequence,
        source: event.source,
        sessionId: event.sessionId,
        tenantId: event.tenantId,
        traceId: event.traceId,
        event: event.event,
      });
    },
  };
}
