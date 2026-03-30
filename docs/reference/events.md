# Events Reference

Agentrail hosts emit runtime and orchestration events for observation and UI integration.

## When To Read This Page

Read this page when:

- you are building a streaming UI or trace panel
- you need to understand mapped orchestration events
- you want to know which event types are meant for observability versus persistence

Events are the main observability channel in Agentrail. They let a host, UI, or debugger understand what the runtime is doing without coupling directly to internal execution logic.

## Mental Model

Think of events as the execution narrative of a request.

They are useful for:

- streaming UIs
- trace/debug panels
- orchestration dashboards
- workflow progress views
- operational diagnostics

They are **not** the primary durable state model for your application.

## Event Sources

Agentrail events typically come from four places:

- runtime-core streaming events
- host-generated lifecycle or compaction events
- orchestration events mapped into host-visible forms
- workflow-specific events, such as deep-research progress events

## Runtime Events

The base runtime emits events such as:

- agent lifecycle events
- turn lifecycle events
- message lifecycle events
- tool execution events

These come from `@agentrail/runtime-core` and are part of the `AgentrailEvent` union used by the host package.

In practice, runtime events are what power:

- token/event streams
- tool progress lists
- activity timelines

## Host Events

The host package adds framework-level events such as:

- `context_compaction_start`
- `context_compaction_end`
- `context_usage`
- `error`

These events are defined in:

- [packages/events/src/index.ts](../../packages/events/src/index.ts)

They exist because not every useful event belongs to the runtime loop itself. Some are about host lifecycle and host-managed persistence behavior.

## Orchestration-Mapped Events

The events package also maps orchestration events into a host-facing event vocabulary through:

- `mapOrchestrationEvent(...)`

This produces events such as:

- `orchestration_run_start`
- `orchestration_run_complete`
- `subagent_spawned`
- `subagent_status`
- `subagent_job_started`
- `subagent_job_completed`
- `subagent_job_failed`
- `subagent_message`
- `wait_registered`
- `wait_resolved`
- `subagent_closed`

This mapping exists so UIs do not need to understand the full internal orchestration event schema in order to display useful state.

## Event Contract Shape

The central host-facing unions are:

- `AgentrailHostEvent`
- `AgentrailEvent`

Where:

- `AgentrailHostEvent` covers host-level and orchestration-mapped events
- `AgentrailEvent` combines runtime events, skill SSE events, and host events

That makes `AgentrailEvent` the most useful “single stream” type for consumers building dashboards or UIs.

## Design Intent

The event layer is meant to be:

- composable
- stream-friendly
- UI-friendly
- more stable than raw internal implementation details

It is **not** meant to replace:

- persisted session history
- workflow state stores
- domain-specific application state

## Repository Example

The playground server uses orchestration event mapping from:

- [packages/events/src/index.ts](../../packages/events/src/index.ts)

and forwards those mapped events through the stream host in:

- [packages/host/src/stream-route.ts](../../packages/host/src/stream-route.ts)

This is a good example of how the event layer sits between runtime execution and UI consumption.

## How To Consume Events

For most consumers:

1. subscribe to the stream response
2. treat events as append-only observations
3. derive UI state from them
4. use durable stores for anything that must survive beyond the stream

That is exactly how the example UI treats orchestration and deep-research progress: events update in-memory state, while persisted routes remain the source of truth for recovery.

## Common Mistakes

Avoid these patterns:

- treating events as the only durable state source
- building business logic that depends on one exact event order unless the contract guarantees it
- exposing raw internal orchestration events directly to UI code when a mapped event is already available

## Recommendation

Treat events as the observability layer for execution, not as the primary business-state store.

Use them to drive UI feedback and diagnostics, but persist real application state separately.

## Related Docs

- [Concepts: Events and Orchestration](../concepts/events-and-orchestration.md)
- [Host Primitives Reference](host-primitives.md)
- [Examples: Playground Server](../examples/playground-server.md)
