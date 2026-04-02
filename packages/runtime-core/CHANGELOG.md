# @agentrail/runtime-core

## 0.1.0

### Minor Changes

- [#80](https://github.com/yai-dev/agentrail/pull/80) [`aac05e2`](https://github.com/yai-dev/agentrail/commit/aac05e2c4f1ce7150729010d73a4429af3f987f8) Thanks [@yai-dev](https://github.com/yai-dev)! - Make `LlmProviderRegistry` instantiable and add `llmClient` injection to `AgentConfig`.
  - `LlmProviderRegistry`: constructor is no longer `private`, allowing callers to create independent instances without sharing the global singleton. `getInstance()` and `resetInstance()` are preserved for backward compatibility.
  - `AgentConfig`: new optional `llmClient?: LlmClient` field for injecting a client directly into an agent definition.
  - `AgentImpl`: uses the injected client in `stream()` when provided, falling back to `new DefaultLlmClient()` when not — existing behavior is unchanged.

## 0.0.2

### Patch Changes

- [#43](https://github.com/yai-dev/agentrail/pull/43) [`f2716be`](https://github.com/yai-dev/agentrail/commit/f2716be16589f1a5d0097a258e8529cbf51fd8ba) Thanks [@yai-dev](https://github.com/yai-dev)! - Fix conversationId collision and add context compaction to chat route

  Fixes [#35](https://github.com/yai-dev/agentrail/issues/35): replace `Date.now()` with `randomUUID()` for `conversationId`
  generation in `agent-impl.ts`, eliminating collisions under concurrent load.

  Fixes [#24](https://github.com/yai-dev/agentrail/issues/24): extract compaction logic into a shared `runCompactionIfNeeded`
  helper and wire it into the chat route (with `loadMessagesWithBudget`),
  closing the feature gap between the stream and chat endpoints.
  `AgentrailChatRouteOptions` now requires `summarize` and `compaction` fields.
