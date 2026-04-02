# @agentrail/host

## 0.0.4

### Patch Changes

- Updated dependencies [[`aac05e2`](https://github.com/yai-dev/agentrail/commit/aac05e2c4f1ce7150729010d73a4429af3f987f8)]:
  - @agentrail/runtime-core@0.1.0
  - @agentrail/events@0.0.4
  - @agentrail/knowledge@0.0.3
  - @agentrail/memo@0.0.3
  - @agentrail/orchestration@0.0.4
  - @agentrail/sandbox@0.0.3
  - @agentrail/skills@0.0.3
  - @agentrail/tools@0.0.3

## 0.0.3

### Patch Changes

- [#44](https://github.com/yai-dev/agentrail/pull/44) [`7feaa9b`](https://github.com/yai-dev/agentrail/commit/7feaa9baca6a3e8ed2b69bf6930fd069db1a9ab7) Thanks [@yai-dev](https://github.com/yai-dev)! - Fix sandbox error swallowing, budgetUsedPct hardcoding, and prompt cache leaking

  Fixes [#21](https://github.com/yai-dev/agentrail/issues/21): replace `void ensureSandbox(...)` with a stored promise that is
  awaited inside the streamText callback; failures are surfaced as an SSE error
  event so clients are immediately aware of sandbox startup problems.

  Fixes [#25](https://github.com/yai-dev/agentrail/issues/25): add optional `contextWindow` field to `AgentrailProfile`; stream
  route uses `profile.contextWindow ?? 200_000` instead of the hardcoded 200k,
  giving correct budget percentages for GPT-4o, Gemini, and other models.

  Fixes [#30](https://github.com/yai-dev/agentrail/issues/30): introduce `PromptLoader` class with instance-level mtime cache;
  `createPromptBuilder` now creates a private `PromptLoader` per builder so
  caches never bleed between instances or between test runs.

- [#43](https://github.com/yai-dev/agentrail/pull/43) [`f2716be`](https://github.com/yai-dev/agentrail/commit/f2716be16589f1a5d0097a258e8529cbf51fd8ba) Thanks [@yai-dev](https://github.com/yai-dev)! - Fix conversationId collision and add context compaction to chat route

  Fixes [#35](https://github.com/yai-dev/agentrail/issues/35): replace `Date.now()` with `randomUUID()` for `conversationId`
  generation in `agent-impl.ts`, eliminating collisions under concurrent load.

  Fixes [#24](https://github.com/yai-dev/agentrail/issues/24): extract compaction logic into a shared `runCompactionIfNeeded`
  helper and wire it into the chat route (with `loadMessagesWithBudget`),
  closing the feature gap between the stream and chat endpoints.
  `AgentrailChatRouteOptions` now requires `summarize` and `compaction` fields.

- Updated dependencies [[`58bd795`](https://github.com/yai-dev/agentrail/commit/58bd79566ceb12565dca2e5b6e287f426444070d), [`f2716be`](https://github.com/yai-dev/agentrail/commit/f2716be16589f1a5d0097a258e8529cbf51fd8ba)]:
  - @agentrail/sandbox@0.0.2
  - @agentrail/runtime-core@0.0.2
  - @agentrail/events@0.0.3
  - @agentrail/knowledge@0.0.2
  - @agentrail/memo@0.0.2
  - @agentrail/orchestration@0.0.3
  - @agentrail/skills@0.0.2
  - @agentrail/tools@0.0.2

## 0.0.2

### Patch Changes

- [#8](https://github.com/yai-dev/agentrail/pull/8) [`1ba73a1`](https://github.com/yai-dev/agentrail/commit/1ba73a1b772835d642934889fc195e5f195bcdf3) Thanks [@yai-dev](https://github.com/yai-dev)! - Fix deep research mode on the playground stream route

  Add stream-route request interception so deep research mode can take over SSE handling, expose a streaming deep-research runner, and wire the playground server to emit deep*research*\_ and subagent\_\_ events while keeping chat mode unchanged. Also fail fast when a spawned sub-agent never becomes ready, mark the orchestration/deep-research runs as failed instead of leaving them stuck in running state, and persist a readable assistant error message back to the session.

- Updated dependencies [[`1ba73a1`](https://github.com/yai-dev/agentrail/commit/1ba73a1b772835d642934889fc195e5f195bcdf3)]:
  - @agentrail/orchestration@0.0.2
  - @agentrail/events@0.0.2
