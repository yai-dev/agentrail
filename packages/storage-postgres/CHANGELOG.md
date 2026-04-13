# @agentrail/storage-postgres

## 0.2.0

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
  - @agentrail/app@0.7.0
