# @agentrail/app

## 0.5.0

### Minor Changes

- [#133](https://github.com/yai-dev/agentrail/pull/133) [`3dbbf44`](https://github.com/yai-dev/agentrail/commit/3dbbf4495906baac00b6b3f0b12341eaf127381f) Thanks [@yai-dev](https://github.com/yai-dev)! - Add `onBeforeToolCall` / `onAfterToolCall` plugin hooks and `ToolInterceptor` core interface.

  **`@agentrail/core`**
  - New `ToolInterceptor` interface with `onBeforeToolCall` and `onAfterToolCall` methods, exported from the package root.
  - New related types: `BeforeToolCallResult`, `ToolInterceptorBeforeContext`, `ToolInterceptorAfterContext`.
  - `AgentRunOptions` gains an optional `toolInterceptor` field that threads the interceptor into every tool execution.
  - `tool.before` stream event gains a `rawArgs` field that always carries the original model-generated arguments. `args` now reflects the effective (post-interceptor) input that was actually passed to the tool.

  **`@agentrail/app`**
  - `AgentrailPlugin` gains two new optional hooks:
    - `onBeforeToolCall(event)` — called before each tool executes; can allow, modify, or deny the call.
    - `onAfterToolCall(event)` — called after each tool completes (success or error, not deny).
  - New exported types: `BeforeToolCallEvent`, `AfterToolCallEvent`, `AppBeforeToolCallResult`.
  - New `buildToolInterceptor(plugins, profileCtx, onError)` helper that composes plugin hooks in priority order with `safeNotify` error isolation.
  - Hooks are only dispatched for tools whose validated input is a plain object; array- and primitive-typed tools skip both hooks.
  - Corrected plugin lifecycle order in JSDoc: `onTurnPersisted` fires before `onRequestEnd`.

### Patch Changes

- Updated dependencies [[`3dbbf44`](https://github.com/yai-dev/agentrail/commit/3dbbf4495906baac00b6b3f0b12341eaf127381f), [`72c911f`](https://github.com/yai-dev/agentrail/commit/72c911feea31934dcf1561e71d6a94b8518f0b16)]:
  - @agentrail/core@0.5.0
  - @agentrail/capabilities@0.2.1

## 0.4.0

### Minor Changes

- [#131](https://github.com/yai-dev/agentrail/pull/131) [`f33c7e6`](https://github.com/yai-dev/agentrail/commit/f33c7e6804e7c33bde8f91b4d8c68c9bc623fbbd) Thanks [@yai-dev](https://github.com/yai-dev)! - Persist oversized tool result text to session storage during compaction when callers provide a `sessionDir` through the memory context. `compactToolResults` is now async and should be awaited by direct callers.

  Recent tool results are still preserved by default, but extremely large recent outputs are now compacted immediately to avoid overflowing the next model request.

  Profiles and capabilities can now contribute request-time history rewrites via transform contexts. `memoryContext(...)` now supplies both injected context providers and a real transform path, so tool-result compaction rewrites are applied to model-facing messages instead of being discarded by provider adaptation.

  Long-running turns now support reactive compaction in the agent loop. Agentrail can micro-compact or full-compact older API rounds before the next model call, and can retry once after prompt-too-long errors by compacting in-memory request history.

  The playground session history API now restores context-window usage from the latest assistant message usage when available, keeping the reloaded UI indicator aligned with the live `context_usage` stream event instead of inflating it with per-request aggregate usage.

### Patch Changes

- Updated dependencies [[`f33c7e6`](https://github.com/yai-dev/agentrail/commit/f33c7e6804e7c33bde8f91b4d8c68c9bc623fbbd)]:
  - @agentrail/core@0.4.0
  - @agentrail/capabilities@0.2.0

## 0.3.2

### Patch Changes

- [#128](https://github.com/yai-dev/agentrail/pull/128) [`cbf6935`](https://github.com/yai-dev/agentrail/commit/cbf6935ef041b455717a6fea0d96a472ec858f3d) Thanks [@yai-dev](https://github.com/yai-dev)! - Add package READMEs for all published Agentrail packages and include them in npm publishes. Also add `llms.txt` to the documentation site so AI tools can discover the current docs structure more reliably.

- Updated dependencies [[`cbf6935`](https://github.com/yai-dev/agentrail/commit/cbf6935ef041b455717a6fea0d96a472ec858f3d)]:
  - @agentrail/capabilities@0.1.5
  - @agentrail/core@0.3.2

## 0.3.1

### Patch Changes

- [#124](https://github.com/yai-dev/agentrail/pull/124) [`a1b916c`](https://github.com/yai-dev/agentrail/commit/a1b916c258cb05dff8880dd5abf2f23318e4d1ca) Thanks [@yai-dev](https://github.com/yai-dev)! - Fix incremental session persistence and text streaming during tool-using turns, and harden orchestration run startup against concurrent first-spawn races.

  Update the playground UI to align more closely with the inspector visual language, remove the trace tab from the workspace, and refine responsive behavior across the deep research and agent team panels.

- [#127](https://github.com/yai-dev/agentrail/pull/127) [`fd9c649`](https://github.com/yai-dev/agentrail/commit/fd9c6492a337a9b50c9c5a7f94f3e6112f2d4ce8) Thanks [@yai-dev](https://github.com/yai-dev)! - Add generic `Glob`, `WebFetch`, and `WebSearch` tools to `@agentrail/capabilities`, including Brave and Jina search providers.

  Wire `Glob` into the default filesystem capability and compat tool bundle, update deep-research to use the shared web tools, and extend app/CLI config support for Brave and Jina API keys and doctor checks.

- [#126](https://github.com/yai-dev/agentrail/pull/126) [`6235abf`](https://github.com/yai-dev/agentrail/commit/6235abf6a72631aff76cc3a3dd3fb5399e9706e5) Thanks [@yai-dev](https://github.com/yai-dev)! - Add a built-in `Sleep` tool to `@agentrail/capabilities` for bounded wait/backoff patterns, including abort-aware execution and duration clamping.

  Include `Sleep` in the default filesystem capability toolset and the compat `buildDefaultCapabilityTools()` execution tools.

- Updated dependencies [[`a1b916c`](https://github.com/yai-dev/agentrail/commit/a1b916c258cb05dff8880dd5abf2f23318e4d1ca), [`fd9c649`](https://github.com/yai-dev/agentrail/commit/fd9c6492a337a9b50c9c5a7f94f3e6112f2d4ce8), [`6235abf`](https://github.com/yai-dev/agentrail/commit/6235abf6a72631aff76cc3a3dd3fb5399e9706e5)]:
  - @agentrail/capabilities@0.1.4
  - @agentrail/core@0.3.1

## 0.3.0

### Minor Changes

- [#121](https://github.com/yai-dev/agentrail/pull/121) [`5a653f6`](https://github.com/yai-dev/agentrail/commit/5a653f62ac61caec15d4017fadf76909552ff9b0) Thanks [@yai-dev](https://github.com/yai-dev)! - Add Inspector API, health route, telemetry sink, and CLI package

  **`@agentrail/app`**
  - New `inspector` option on `createAgentApp` — set `inspector: true` to mount a read-only `/__inspector` API consumed by the [Agentrail Inspector](https://github.com/yai-dev/agentrail-inspector) Docker image. Requires `dataDir`; exposes session list, merged trace, and orchestration snapshots.
  - New `health` option — automatically mounts `GET /health` (liveness) and `GET /ready` (readiness) probes with built-in session-store check and optional custom `readinessChecks`.
  - New `telemetry` option — attach a `TelemetrySink` to receive structured `WorkflowTraceEventEnvelope` events for external observability pipelines.
  - New `compat` guard — `runCapabilityCompatibilityChecks` validates capability package versions at startup and logs actionable warnings.
  - `createInspectorRoute` is also exported from `@agentrail/app/advanced` for custom mounting.

  **`@agentrail/core`**
  - Extended `SessionRef` contract with additional metadata fields used by the Inspector listing API.

  **`@agentrail/cli`**
  - New `@agentrail/cli` package providing the `agentrail` command-line tool for local development and deployment workflows.

  **`@agentrail/create-agentrail-app`**
  - Updated scaffolding templates to reflect the new `createAgentApp` options and align with current package versions.

### Patch Changes

- Updated dependencies [[`5a653f6`](https://github.com/yai-dev/agentrail/commit/5a653f62ac61caec15d4017fadf76909552ff9b0)]:
  - @agentrail/core@0.3.0
  - @agentrail/capabilities@0.1.3

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
