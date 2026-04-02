# Events

Agentrail uses a typed event stream to surface runtime execution, host lifecycle, and orchestration state changes to the client.

## What Events Are

Events are the observability channel for a request. They let a UI, trace panel, or dashboard understand what the runtime is doing — without coupling to internal execution logic.

Events are **not** the durable state model. Use session history and application stores for state that must survive beyond the current request.

## Where Events Come From

Events in Agentrail come from three sources:

### 1. Runtime Core Events

Emitted by the agent loop as it executes. These cover the execution narrative of a single turn:

| Event                    | When It Fires                                                   |
| ------------------------ | --------------------------------------------------------------- |
| `agent_start`            | Agent loop begins                                               |
| `turn_start`             | A new LLM call round begins                                     |
| `message_start`          | LLM starts generating a response                                |
| `message_update`         | LLM emits a text delta                                          |
| `message_end`            | LLM finishes the response                                       |
| `tool_execution_start`   | A tool call is being executed                                   |
| `tool_execution_end`     | A tool call completes                                           |
| `turn_end`               | The LLM call round finishes                                     |
| `max_turns_reached`      | Agent hit its turn limit                                        |
| `waiting_for_user_input` | A tool is waiting for user interaction                          |
| `agent_end`              | Agent loop finishes — includes all new messages and total usage |
| `error`                  | An unrecoverable error occurred                                 |

### 2. Host-Level Events

Added by the host layer on top of runtime events:

| Event                      | When It Fires                    |
| -------------------------- | -------------------------------- |
| `context_compaction_start` | Compaction begins                |
| `context_compaction_end`   | Compaction finishes              |
| `context_usage`            | Token budget status after a turn |

These are defined in `@agentrail/events` and forwarded by the stream route.

### 3. Orchestration-Mapped Events

When a hosted session uses orchestration, the orchestration manager emits internal events that the host maps into a stable, UI-friendly vocabulary:

| Event                        | Meaning                                 |
| ---------------------------- | --------------------------------------- |
| `orchestration_run_start`    | A multi-agent run begins                |
| `orchestration_run_complete` | A multi-agent run finishes              |
| `subagent_spawned`           | A sub-agent was created                 |
| `subagent_status`            | A sub-agent's state changed             |
| `subagent_message`           | A sub-agent produced a message          |
| `subagent_job_started`       | A sub-agent started processing an input |
| `subagent_job_completed`     | A sub-agent completed an input          |
| `subagent_job_failed`        | A sub-agent failed on an input          |
| `subagent_closed`            | A sub-agent was closed                  |
| `wait_registered`            | An orchestration wait was registered    |
| `wait_resolved`              | An orchestration wait resolved          |

The mapping is done by `mapOrchestrationEvent` in `@agentrail/events`, so UIs do not need to understand the raw internal orchestration event schema.

## Event Flow

```
runtime-core          host             SSE stream             UI
────────────          ────             ──────────             ──
agent_start      ──►  forward     ──►  JSON line         ──►  start indicator
turn_start       ──►  forward     ──►                    ──►
message_update   ──►  forward     ──►                    ──►  text delta
tool_exec_start  ──►  forward     ──►                    ──►  tool indicator
tool_exec_end    ──►  forward     ──►                    ──►
agent_end        ──►  forward     ──►                    ──►  final usage
compaction_start ──►  (host adds) ──►                    ──►  compaction badge
context_usage    ──►  (host adds) ──►                    ──►  budget bar
```

## Event Types

The two main event type unions in `@agentrail/events`:

- **`AgentrailHostEvent`** — host-level and orchestration-mapped events
- **`AgentrailEvent`** — the full union combining runtime events, skill SSE events, and host events

Use `AgentrailEvent` as the single stream type when building a consumer that needs to handle everything.

## Consuming Events on the Client

The stream route sends events as newline-delimited JSON over SSE. Each line is a serialized `AgentrailEvent`. A minimal client:

```ts
const response = await fetch("/api/stream", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "Hello" }),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  for (const line of decoder.decode(value).split("\n").filter(Boolean)) {
    const event = JSON.parse(line);
    if (event.type === "message_update") {
      process.stdout.write(event.delta ?? "");
    }
  }
}
```

## Design Intent

The event layer is designed to be:

- **composable** — different sources (runtime, host, orchestration) feed into one stream
- **stream-friendly** — events are append-only, newline-delimited JSON
- **UI-friendly** — mapped events expose stable vocabulary rather than raw internal state
- **observability-first** — not a replacement for persistent state

## Related Concepts

- [Host](host.md)
- [Orchestration](orchestration.md)
- [Sessions](sessions.md)

## Related Reference

- [Events Reference](../reference/events.md)
- [Host Primitives Reference](../reference/host-primitives.md)
