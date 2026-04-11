# Telemetry Sink Reference

The telemetry sink is a pluggable interface that receives structured events from both the `/chat` and `/stream` routes. Use it to forward events to external observability pipelines such as OpenTelemetry, Datadog, or a custom backend.

## Enabling a sink

Pass a `TelemetrySink` via `createAgentApp`:

```ts
import { createAgentApp, createFileTelemetrySink } from "@agentrail/app";

const app = createAgentApp({
  dataDir: "./data",
  profiles: [myProfile],
  telemetrySink: createFileTelemetrySink("./data"),
});
```

## `TelemetrySink` interface

```ts
interface TelemetrySink {
  emit(event: TelemetrySinkEvent): void | Promise<void>;
  flush?(): Promise<void>;
}
```

### `emit(event)`

Called for each telemetry event. May be async. Errors thrown by `emit` are swallowed by the framework — a failing sink never breaks the request pipeline.

### `flush()`

Optional. Called by the framework at the end of each HTTP request to drain any in-memory write buffer before the response is finalised.

**Shutdown flush is the host application's responsibility.** The framework does not install process signal handlers. Wire this into your own shutdown sequence:

```ts
process.once("SIGTERM", async () => {
  await telemetrySink.flush?.();
  process.exit(0);
});
```

## `TelemetrySinkEvent`

```ts
interface TelemetrySinkEvent {
  traceId: string;
  sessionId: string;
  tenantId: string;
  timestamp: string; // ISO-8601
  sequence: number; // monotonically increasing within a request
  source: "runtime" | "orchestration" | "host";
  event: Record<string, unknown>;
}
```

| Field       | Description                                                           |
| ----------- | --------------------------------------------------------------------- |
| `traceId`   | Unique identifier for the originating request chain                   |
| `sessionId` | Session this event belongs to                                         |
| `tenantId`  | Tenant this event belongs to                                          |
| `timestamp` | ISO-8601 timestamp                                                    |
| `sequence`  | Monotonically increasing counter within a single request              |
| `source`    | Where the event originated (see below)                                |
| `event`     | Raw event payload matching the corresponding `AgentrailEvent` subtype |

### Event sources

| Source            | Description                                                             |
| ----------------- | ----------------------------------------------------------------------- |
| `"runtime"`       | Agent loop events: turn start/end, tool calls, compaction, errors       |
| `"orchestration"` | Multi-agent coordination events: agent spawn, job dispatch, agent close |
| `"host"`          | Framework-level events emitted by the `/chat` or `/stream` route        |

## Built-in sinks

### `createConsoleTelemetrySink()`

Pretty-prints each event to stdout. For local development only — not recommended for production.

```ts
import { createConsoleTelemetrySink } from "@agentrail/app";

const app = createAgentApp({
  dataDir: "./data",
  profiles: [myProfile],
  telemetrySink: createConsoleTelemetrySink(),
});
```

### `createFileTelemetrySink(dataDir)`

Appends events as JSONL trace files under `dataDir`. Uses the same directory layout as `SessionManager`, so the [Agentrail Inspector](/reference/inspector-route) can read them directly.

Stores are created lazily on first write and cached for the lifetime of the process.

```ts
import { createFileTelemetrySink } from "@agentrail/app";

const app = createAgentApp({
  dataDir: "./data",
  profiles: [myProfile],
  telemetrySink: createFileTelemetrySink("./data"),
  inspector: true, // Inspector reads the same files
});
```

## Writing a custom sink

Implement the `TelemetrySink` interface to forward events to any backend:

```ts
import type { TelemetrySink, TelemetrySinkEvent } from "@agentrail/app";

function createOpenTelemetrySink(): TelemetrySink {
  return {
    async emit(event: TelemetrySinkEvent): Promise<void> {
      const span = tracer.startSpan(String(event.event["type"] ?? "unknown"), {
        attributes: {
          "agentrail.session_id": event.sessionId,
          "agentrail.tenant_id": event.tenantId,
          "agentrail.trace_id": event.traceId,
          "agentrail.source": event.source,
        },
      });
      span.end();
    },
    async flush(): Promise<void> {
      await provider.forceFlush();
    },
  };
}
```

## Event granularity by route

Events emitted via `/chat` are coarser than `/stream`:

| Route     | Events emitted                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/stream` | Full granularity: `session.start`, `turn.start`, `tool.before`, `tool.after`, `turn.end`, `session.end`, compaction events   |
| `/chat`   | Synthetic only: `agent_start`, `agent_end`, and `error` — because `agent.invoke()` does not expose granular turn/tool events |

For complete observability traces, use the `/stream` route.
