# @agentrail/app

## 0.2.0

### Minor Changes

- [#114](https://github.com/yai-dev/agentrail/pull/114) [`25a835d`](https://github.com/yai-dev/agentrail/commit/25a835d9b3b5e6b6e5aef975b8919731b7df25f8) Thanks [@yai-dev](https://github.com/yai-dev)! - Add per-plugin error isolation, `priority` ordering, and `onPluginError` observability callback.

  All plugin hooks (`start`, `stop`, request lifecycle hooks, `interceptChatRequest`,
  `attachmentHandler`) are now wrapped in individual try/catch blocks so that a throwing
  plugin never propagates to the host request unless `critical: true` is set.

  New fields on `AgentrailPlugin`:
  - `priority?: number` — controls execution order (descending for start/request hooks,
    ascending for stop). Defaults to `0`.
  - `critical?: boolean` — when `true`, errors in `interceptChatRequest` propagate and
    abort the request. Defaults to `false`.

  New types exported from `@agentrail/app`:
  - `PluginErrorContext` — payload passed to the error handler.
  - `PluginErrorHandler` — callback type `(ctx: PluginErrorContext) => void | Promise<void>`.

  New option `onPluginError?: PluginErrorHandler` on `CreateAgentAppOptions`,
  `AgentrailChatRouteOptions`, and `AgentrailStreamRouteOptions`. Pass the same handler
  to `runPluginLifecycle()` for unified error reporting across lifecycle and request-time paths.

  The `runPluginLifecycle` signature gains an optional third parameter `onError?:
PluginErrorHandler`. Existing callers that omit it fall back to `console.warn` — no
  breaking change.

- [#113](https://github.com/yai-dev/agentrail/pull/113) [`cd58ddc`](https://github.com/yai-dev/agentrail/commit/cd58ddc9afa437cfbfa9bbcf33a82fcfd9acb8da) Thanks [@yai-dev](https://github.com/yai-dev)! - Rename `RuntimeEvent` discriminants to a dotted-namespace convention and stabilise public contracts.

  **Breaking (minor):** All `RuntimeEvent` type strings have been renamed:

  | Old                     | New              |
  | ----------------------- | ---------------- |
  | `agent_start`           | `session.start`  |
  | `agent_end`             | `session.end`    |
  | `turn_start`            | `turn.start`     |
  | `turn_end`              | `turn.complete`  |
  | `message_start`         | `message.start`  |
  | `message_update`        | `message.update` |
  | `message_end`           | `message.end`    |
  | `tool_execution_start`  | `tool.before`    |
  | `tool_execution_update` | `tool.update`    |
  | `tool_execution_end`    | `tool.after`     |

  New events added: `compaction`, `subagent.spawn`, `subagent.complete`.

  Deprecated type aliases (`AgentStartEvent`, `AgentEndEvent`, `TurnStartEvent`, `TurnEndEvent`, etc.) are exported for migration and will be removed in the next major version.

  `AgentrailPlugin` now has an optional `version?: string` field. `AgentrailSessionStore` and `AgentrailPlugin` interfaces gain comprehensive JSDoc.

### Patch Changes

- [#110](https://github.com/yai-dev/agentrail/pull/110) [`4ea5933`](https://github.com/yai-dev/agentrail/commit/4ea5933b1b9bfb831c23e51227fb7c4625abb2f8) Thanks [@yai-dev](https://github.com/yai-dev)! - fix: upgrade dependencies and harden regex patterns against ReDoS
  - Upgrade `hono` to ^4.12.12, `@hono/node-server` to ^1.19.13, and `vite` to ^6.4.2 to address known CVEs
  - Replace `stripHtml` regex chain with `node-html-parser` to eliminate polynomial ReDoS and handle malformed HTML robustly
  - Bound all unbounded quantifiers (`\d+`, ` +`) in compaction and fenced-code-block regexes to prevent ReDoS on crafted input
  - Remove Chinese-only regex fallbacks (`extractOfficialName`, `extractExcludedEntities`, etc.) that were non-functional for non-Chinese users; rely on structured LLM output instead

- [#112](https://github.com/yai-dev/agentrail/pull/112) [`98f9cbe`](https://github.com/yai-dev/agentrail/commit/98f9cbeabb0f20d8d6f3fda7ff15b4e987f3fc30) Thanks [@yai-dev](https://github.com/yai-dev)! - refactor: split stream-route into single-responsibility modules

  Dissolves `stream-route-internals.ts` and decomposes `stream-route.ts` into
  focused modules (`stream-request.ts`, `attachment-pipeline.ts`, `sse-writer.ts`,
  `context-resolver.ts`, `compaction-runner.ts`, `sandbox-warmup.ts`). No
  behavior changes — pure internal restructuring for maintainability.

- Updated dependencies [[`cd58ddc`](https://github.com/yai-dev/agentrail/commit/cd58ddc9afa437cfbfa9bbcf33a82fcfd9acb8da)]:
  - @agentrail/core@0.2.0
  - @agentrail/capabilities@0.1.2

## 0.1.1

### Patch Changes

- [#88](https://github.com/yai-dev/agentrail/pull/88) [`9a65760`](https://github.com/yai-dev/agentrail/commit/9a65760c82e23d4a632abcea66af55e58e099e6a) Thanks [@yai-dev](https://github.com/yai-dev)! - Sort the assembled tool list alphabetically by name in `createDefaultToolset` to ensure a deterministic tool order across requests.

  Previously, tool order depended on import order and conditional inclusion, which could vary between requests and invalidate the LLM provider's prompt cache, incurring full input token costs on every call.

- [#95](https://github.com/yai-dev/agentrail/pull/95) [`432f684`](https://github.com/yai-dev/agentrail/commit/432f684679ef019c4c06466c7b303a4d623e73b7) Thanks [@yai-dev](https://github.com/yai-dev)! - Finish the session storage and sandbox execution cleanup across the framework packages.
  - Replace cross-package `sessionDir` plumbing with `SessionRef`-driven session storage and persistence adapters in host, memo, orchestration, and deep-research.
  - Add a session trace store so runtime trace persistence no longer relies on application code hard-coding trace file paths.
  - Split sandbox execution into strict foreground execution plus Bash-specific background execution with Dockerode-backed timeout handling.
  - Update the default tool and TODO storage integrations to use the new session storage abstractions.

- Updated dependencies [[`745db0d`](https://github.com/yai-dev/agentrail/commit/745db0d1de52ceab85146fc5c89fb2361f536003), [`432f684`](https://github.com/yai-dev/agentrail/commit/432f684679ef019c4c06466c7b303a4d623e73b7)]:
  - @agentrail/capabilities@0.1.1
