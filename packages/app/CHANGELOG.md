# @agentrail/app

## 0.7.0

### Minor Changes

- [#143](https://github.com/yai-dev/agentrail/pull/143) [`f5a4d2e`](https://github.com/yai-dev/agentrail/commit/f5a4d2e24586425f054d35071c76b47078e3cd32) Thanks [@yai-dev](https://github.com/yai-dev)! - **Storage Abstraction + Memo FS + PostgreSQL reference implementation ([#69](https://github.com/yai-dev/agentrail/issues/69))**

  This release completes the Pre-GA storage contract consolidation and ships the `@agentrail/storage-postgres` reference package.

  ### `@agentrail/core` — breaking shape changes + new optional methods
  - `MemoryIndex` no longer contains `sessionDir` or `userDir` host-absolute paths. The `entries[].path` field now stores the canonical `/workspace/memo/…` path directly.
  - `AgentrailSessionStore` gains five new **optional** methods for memo-document and tool-result-artifact persistence:
    - `readMemoryDocument(tenantId, ownerId, scope, name)`
    - `writeMemoryDocument(tenantId, ownerId, scope, name, content)`
    - `appendMemoryDocument(tenantId, ownerId, scope, name, content)`
    - `readToolResultArtifact(sessionRef, toolCallId)`
    - `writeToolResultArtifact(sessionRef, toolCallId, content)`
  - New types exported: `MemoDocumentScope`, `MemoDocumentName`

  ### `@agentrail/capabilities` — new exports + breaking signature
  - `OrchestrationPersistence` gains two new required methods: `loadAgentHistory(agentId)` and `writeAgentHistory(agentId, history)`.
  - `DefaultCapabilityContextOptions.compactMessages` signature updated: `sessionDir` replaced by `writeToolResultArtifact` callback injection.
  - New public exports: `OrchestrationMailboxEvent`, `OrchestrationSnapshot`, `recoverOrchestrationState`.
  - `WorkerInitMessage` gains an optional `storageConfig` field for sub-agent worker initialization.

  ### `@agentrail/app` — breaking API surface changes
  - `CreateAgentAppOptions` gains: `traceStoreFactory`, `createOrchestrationPersistence`, `createWorkerStorageConfig`, and `inspector` (now accepts `true | InspectorDataSource`).
  - `createInspectorRoute` now accepts `InspectorDataSource | string` (string is deprecated backward-compat path; direct `dataDir` strings will be removed in a future release).
  - `UserMemoryConsolidationService` constructor signature changed from `(sessionManager, dataDir, config)` to `(store: AgentrailSessionStore, sessionLister: UserSessionLister, dataDir, config)`.
  - New `UserSessionLister` interface exported.
  - New `InspectorDataSource`, `InspectorSessionItem`, `SessionTraceStore` types exported.
  - New `createFilesystemInspectorDataSource(dataDir)` function exported.
  - `compactToolResults` now prefers `writeToolResultArtifact` from the session store when available.
  - Pure compaction helpers exported: `computeCompactionSplit`, `buildCompactionMessage`, `buildCompactionNotesEntry`.

  ### `@agentrail/storage-postgres` — new package

  PostgreSQL reference implementation for all Agentrail storage contracts:
  - `PostgresSessionStore` — full `AgentrailSessionStore` including memo documents and tool-result artifacts.
  - `PostgresSessionTraceStore` + `createPostgresSessionTraceStore` factory.
  - `PostgresOrchestrationPersistence` + `createPostgresOrchestrationPersistence` factory (includes agent history).
  - `PostgresInspectorDataSource` — reads session list, messages, trace envelopes, and orchestration state from PostgreSQL without any filesystem dependency.
  - `buildSchemaDDL(schema?)` — returns idempotent DDL to create all required tables.
  - `createSqlClient(options)` — creates a `postgres` (postgres.js) connection pool.

  **Upgrade notes:**
  1. If you implement `AgentrailSessionStore`, the new optional methods do not need to be implemented immediately; the runtime falls back gracefully. However, implementing them is required to use the postgres backend.
  2. If you implement `OrchestrationPersistence`, you must add `loadAgentHistory` and `writeAgentHistory`.
  3. Replace `createInspectorRoute(dataDir)` with `createInspectorRoute(createFilesystemInspectorDataSource(dataDir))` when providing a custom `InspectorDataSource`.
  4. `UserMemoryConsolidationService` callers must provide a `UserSessionLister` (the default `SessionManager` now implements this interface).

### Patch Changes

- Updated dependencies [[`f5a4d2e`](https://github.com/yai-dev/agentrail/commit/f5a4d2e24586425f054d35071c76b47078e3cd32)]:
  - @agentrail/core@0.7.0
  - @agentrail/capabilities@0.4.0

## 0.6.0

### Minor Changes

- [#141](https://github.com/yai-dev/agentrail/pull/141) [`0075fc6`](https://github.com/yai-dev/agentrail/commit/0075fc6d98cb11ce8a91a818bc5bee931c7f1755) Thanks [@yai-dev](https://github.com/yai-dev)! - Fix and extend the tool permission policy system:
  - Add `"strict"` `PermissionMode`: deny-by-default mode where only operations listed in `allow` are permitted. Use for minimal-privilege configurations.
  - Add `contentMode: "path" | "command"` parameter to `matchPattern` and `evaluatePolicy`. Bash tools now pass `"command"` so that `*` wildcards match across `/` in command arguments (e.g. `git:add src/main.ts` matches `Bash(git:*)`).
  - Fix missing `?` in regex escape list — a literal `?` in a pattern no longer acts as an optional quantifier.
  - Fix cross-platform ancestor resolution in `path-safety.ts` using `path.dirname` loop instead of POSIX-specific `split`/`join`.
  - Fix `normalizeBashCommand` to handle tab and other whitespace between verb and arguments.
  - Export `ContentMatchMode` type from `@agentrail/capabilities`.
  - `AgentrailPermissionsConfig.mode` and `agentrail.yaml` now accept `"strict"` as a valid permissions mode.

- [#140](https://github.com/yai-dev/agentrail/pull/140) [`81f5cca`](https://github.com/yai-dev/agentrail/commit/81f5cca508d22c4a101c2989076ea7e228b4e8c8) Thanks [@yai-dev](https://github.com/yai-dev)! - Add `chainId`, `depth`, and `turnIndex` tracing fields to every `RuntimeEvent`.
  - **`@agentrail/core`**: `RuntimeTracingFields` interface exported from the package root. Every `RuntimeEvent` variant is now intersected with `RuntimeTracingFields` (all three fields are required). `AgentRunOptions` gains optional `chainId` and `depth` fields that flow into the agent loop. `InternalContext` is extended with the same optional fields.
  - **`@agentrail/capabilities`**: `CapabilityBuildContext` gains an optional `tracing` field `{ chainId: string; depth: number }`. `SpawnAgentInput` and `CreateManagedAgentInput` gain optional `chainId` and `depth` fields. The `spawn_agent` tool increments depth and propagates `chainId` to the child agent. `WorkerInitMessage` and `WorkerState` carry the same fields so the worker process can pass them to `agent.invoke`.
  - **`@agentrail/app`**: `AgentrailProfileContext` gains an optional `chainId` field. The route-level `traceId` / `requestTraceId` is propagated as `chainId` into `AgentrailProfileContext`, `CapabilityBuildContext.tracing`, and `AgentRunOptions.chainId` so that `RuntimeEvent.chainId === telemetry traceId` for the full request chain.

- [#141](https://github.com/yai-dev/agentrail/pull/141) [`405d8de`](https://github.com/yai-dev/agentrail/commit/405d8de29b0ac64f29e492f20f66a44b187c12bf) Thanks [@yai-dev](https://github.com/yai-dev)! - Add tool permission policy system

  Introduces a structured, rule-based permission layer that sits between the LLM
  and tool execution, enabling fine-grained control over which operations agents
  are allowed to perform.

  ### @agentrail/core
  - New `PermissionDecision` type (`"allow" | "deny" | "ask"` or object form with optional `reason`).
  - New optional `checkPermissions(params)` hook on `RuntimeTool` — called after
    `onBeforeToolCall` interceptors but before `validate` and `execute`.
  - New `permission_request` `RuntimeEvent` — emitted when `checkPermissions` returns `"ask"`.
  - `ToolBuilder` gains a `.checkPermissions()` fluent method.
  - `permission_request` is added to `TRACE_PERSISTED_EVENT_TYPES`.

  ### @agentrail/capabilities
  - New `packages/capabilities/src/permissions/` module:
    - `ToolPermissionPolicy` / `PermissionRule` / `PermissionMode` types.
    - `parseRule` / `parseRules` DSL parser (e.g. `"Bash(git:*)"`, `"Write(/workspace/**)"`)
    - `evaluatePolicy` rule engine with priority order: deny → ask → allow → default.
    - `isPathSafe` / `workspaceAnchor` path-safety utilities.
    - `isDangerousCommand` / `isReadOnlyCommand` shell-safety utilities.
  - `CapabilityBuildContext` gains optional `permissionPolicy?: ToolPermissionPolicy`.
  - Non-sandboxed `bashTool`, `readTool`, `writeTool`, `editTool` are now created via
    factory functions (`createBashTool`, `createReadTool`, `createWriteTool`, `createEditTool`)
    that accept optional `rootDir` and `policy` options; the singleton exports are
    kept for backward compatibility.
  - Sandboxed `createSandboxedBash` accepts an optional `policy` parameter.
  - All new symbols are exported from the package root.

  ### @agentrail/app
  - `AgentrailProfileContext` gains optional `permissionPolicy?: ToolPermissionPolicy`.
  - `defineProfile` propagates `permissionPolicy` from profile context into
    `CapabilityBuildContext`.
  - `createAgentApp`, `createStreamRoute`, and `createChatRoute` all accept an
    optional `permissionPolicy` option that is forwarded to every request.
  - `AgentrailConfig` (YAML config) gains an optional `permissions` block with
    `mode`, `allow`, `deny`, and `ask` keys.
  - `DefaultCapabilityToolOptions` gains optional `permissionPolicy` forwarded to
    sandboxed tools.

### Patch Changes

- Updated dependencies [[`8e9b041`](https://github.com/yai-dev/agentrail/commit/8e9b04141e809a3c782e1f09eae1237626c5709e), [`0075fc6`](https://github.com/yai-dev/agentrail/commit/0075fc6d98cb11ce8a91a818bc5bee931c7f1755), [`81f5cca`](https://github.com/yai-dev/agentrail/commit/81f5cca508d22c4a101c2989076ea7e228b4e8c8), [`405d8de`](https://github.com/yai-dev/agentrail/commit/405d8de29b0ac64f29e492f20f66a44b187c12bf)]:
  - @agentrail/capabilities@0.3.0
  - @agentrail/core@0.6.0

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
