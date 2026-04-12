---
"@agentrail/core": minor
"@agentrail/capabilities": minor
"@agentrail/app": minor
---

Add `chainId`, `depth`, and `turnIndex` tracing fields to every `RuntimeEvent`.

- **`@agentrail/core`**: `RuntimeTracingFields` interface exported from the package root. Every `RuntimeEvent` variant is now intersected with `RuntimeTracingFields` (all three fields are required). `AgentRunOptions` gains optional `chainId` and `depth` fields that flow into the agent loop. `InternalContext` is extended with the same optional fields.
- **`@agentrail/capabilities`**: `CapabilityBuildContext` gains an optional `tracing` field `{ chainId: string; depth: number }`. `SpawnAgentInput` and `CreateManagedAgentInput` gain optional `chainId` and `depth` fields. The `spawn_agent` tool increments depth and propagates `chainId` to the child agent. `WorkerInitMessage` and `WorkerState` carry the same fields so the worker process can pass them to `agent.invoke`.
- **`@agentrail/app`**: `AgentrailProfileContext` gains an optional `chainId` field. The route-level `traceId` / `requestTraceId` is propagated as `chainId` into `AgentrailProfileContext`, `CapabilityBuildContext.tracing`, and `AgentRunOptions.chainId` so that `RuntimeEvent.chainId === telemetry traceId` for the full request chain.
