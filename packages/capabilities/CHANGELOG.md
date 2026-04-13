# @agentrail/capabilities

## 0.4.0

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

## 0.3.0

### Minor Changes

- [#138](https://github.com/yai-dev/agentrail/pull/138) [`8e9b041`](https://github.com/yai-dev/agentrail/commit/8e9b04141e809a3c782e1f09eae1237626c5709e) Thanks [@yai-dev](https://github.com/yai-dev)! - Add toolCalls field to sub-agent job results

  ManagedAgentDeliveryResult and OrchestrationAgentJob now carry a toolCalls array with every tool call the sub-agent made during a job, including the tool name, input arguments, and the full output (content and structured details). The wait_agent tool result now includes the resolution object so the parent LLM can see outputText and toolCalls.

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

- Updated dependencies [[`81f5cca`](https://github.com/yai-dev/agentrail/commit/81f5cca508d22c4a101c2989076ea7e228b4e8c8), [`405d8de`](https://github.com/yai-dev/agentrail/commit/405d8de29b0ac64f29e492f20f66a44b187c12bf)]:
  - @agentrail/core@0.6.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`3dbbf44`](https://github.com/yai-dev/agentrail/commit/3dbbf4495906baac00b6b3f0b12341eaf127381f), [`72c911f`](https://github.com/yai-dev/agentrail/commit/72c911feea31934dcf1561e71d6a94b8518f0b16)]:
  - @agentrail/core@0.5.0

## 0.2.0

### Minor Changes

- [#131](https://github.com/yai-dev/agentrail/pull/131) [`f33c7e6`](https://github.com/yai-dev/agentrail/commit/f33c7e6804e7c33bde8f91b4d8c68c9bc623fbbd) Thanks [@yai-dev](https://github.com/yai-dev)! - Persist oversized tool result text to session storage during compaction when callers provide a `sessionDir` through the memory context. `compactToolResults` is now async and should be awaited by direct callers.

  Recent tool results are still preserved by default, but extremely large recent outputs are now compacted immediately to avoid overflowing the next model request.

  Profiles and capabilities can now contribute request-time history rewrites via transform contexts. `memoryContext(...)` now supplies both injected context providers and a real transform path, so tool-result compaction rewrites are applied to model-facing messages instead of being discarded by provider adaptation.

  Long-running turns now support reactive compaction in the agent loop. Agentrail can micro-compact or full-compact older API rounds before the next model call, and can retry once after prompt-too-long errors by compacting in-memory request history.

  The playground session history API now restores context-window usage from the latest assistant message usage when available, keeping the reloaded UI indicator aligned with the live `context_usage` stream event instead of inflating it with per-request aggregate usage.

### Patch Changes

- Updated dependencies [[`f33c7e6`](https://github.com/yai-dev/agentrail/commit/f33c7e6804e7c33bde8f91b4d8c68c9bc623fbbd)]:
  - @agentrail/core@0.4.0

## 0.1.5

### Patch Changes

- [#128](https://github.com/yai-dev/agentrail/pull/128) [`cbf6935`](https://github.com/yai-dev/agentrail/commit/cbf6935ef041b455717a6fea0d96a472ec858f3d) Thanks [@yai-dev](https://github.com/yai-dev)! - Add package READMEs for all published Agentrail packages and include them in npm publishes. Also add `llms.txt` to the documentation site so AI tools can discover the current docs structure more reliably.

- Updated dependencies [[`cbf6935`](https://github.com/yai-dev/agentrail/commit/cbf6935ef041b455717a6fea0d96a472ec858f3d)]:
  - @agentrail/core@0.3.2

## 0.1.4

### Patch Changes

- [#124](https://github.com/yai-dev/agentrail/pull/124) [`a1b916c`](https://github.com/yai-dev/agentrail/commit/a1b916c258cb05dff8880dd5abf2f23318e4d1ca) Thanks [@yai-dev](https://github.com/yai-dev)! - Fix incremental session persistence and text streaming during tool-using turns, and harden orchestration run startup against concurrent first-spawn races.

  Update the playground UI to align more closely with the inspector visual language, remove the trace tab from the workspace, and refine responsive behavior across the deep research and agent team panels.

- [#127](https://github.com/yai-dev/agentrail/pull/127) [`fd9c649`](https://github.com/yai-dev/agentrail/commit/fd9c6492a337a9b50c9c5a7f94f3e6112f2d4ce8) Thanks [@yai-dev](https://github.com/yai-dev)! - Add generic `Glob`, `WebFetch`, and `WebSearch` tools to `@agentrail/capabilities`, including Brave and Jina search providers.

  Wire `Glob` into the default filesystem capability and compat tool bundle, update deep-research to use the shared web tools, and extend app/CLI config support for Brave and Jina API keys and doctor checks.

- [#126](https://github.com/yai-dev/agentrail/pull/126) [`6235abf`](https://github.com/yai-dev/agentrail/commit/6235abf6a72631aff76cc3a3dd3fb5399e9706e5) Thanks [@yai-dev](https://github.com/yai-dev)! - Add a built-in `Sleep` tool to `@agentrail/capabilities` for bounded wait/backoff patterns, including abort-aware execution and duration clamping.

  Include `Sleep` in the default filesystem capability toolset and the compat `buildDefaultCapabilityTools()` execution tools.

- Updated dependencies [[`a1b916c`](https://github.com/yai-dev/agentrail/commit/a1b916c258cb05dff8880dd5abf2f23318e4d1ca)]:
  - @agentrail/core@0.3.1

## 0.1.3

### Patch Changes

- Updated dependencies [[`5a653f6`](https://github.com/yai-dev/agentrail/commit/5a653f62ac61caec15d4017fadf76909552ff9b0)]:
  - @agentrail/core@0.3.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`cd58ddc`](https://github.com/yai-dev/agentrail/commit/cd58ddc9afa437cfbfa9bbcf33a82fcfd9acb8da)]:
  - @agentrail/core@0.2.0

## 0.1.1

### Patch Changes

- [#86](https://github.com/yai-dev/agentrail/pull/86) [`745db0d`](https://github.com/yai-dev/agentrail/commit/745db0d1de52ceab85146fc5c89fb2361f536003) Thanks [@yai-dev](https://github.com/yai-dev)! - Support multiple concurrent orchestration runs in a single `OrchestrationManager`.

  `OrchestrationSnapshot` now stores `runs` instead of a single `run`, and spawn/complete flows now bind explicitly to a `runId`.

  Potential breaking change for consumers using internal orchestration APIs directly:
  - `OrchestrationSnapshot.run` is replaced by `OrchestrationSnapshot.runs`.
  - `spawnAgent` and `completeRun` require an explicit `runId`.

- [#95](https://github.com/yai-dev/agentrail/pull/95) [`432f684`](https://github.com/yai-dev/agentrail/commit/432f684679ef019c4c06466c7b303a4d623e73b7) Thanks [@yai-dev](https://github.com/yai-dev)! - Finish the session storage and sandbox execution cleanup across the framework packages.
  - Replace cross-package `sessionDir` plumbing with `SessionRef`-driven session storage and persistence adapters in host, memo, orchestration, and deep-research.
  - Add a session trace store so runtime trace persistence no longer relies on application code hard-coding trace file paths.
  - Split sandbox execution into strict foreground execution plus Bash-specific background execution with Dockerode-backed timeout handling.
  - Update the default tool and TODO storage integrations to use the new session storage abstractions.
