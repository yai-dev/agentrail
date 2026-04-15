---
"@agentrail/capabilities": minor
---

Remove the first-party PostgreSQL storage backend.

`@agentrail/storage-postgres` has been removed. The package was incomplete — `listToolResultArtifactIds`, `createTodoStorage`, and `persistSkillSubAgentLog` were defined in the schema but never implemented — and its documentation overstated its capabilities.

**Migration:** For horizontal scaling, mount a shared filesystem (NFS, EFS, etc.) at the same `dataDir` path on all instances. The `AgentrailSessionStore` interface remains available as an advanced extension point for custom implementations.

`WorkerStorageConfig` in `@agentrail/capabilities` no longer includes a `postgres` branch. If you were passing `storageConfig: { type: "postgres", ... }` to sub-agent workers, switch to `{ type: "filesystem", dataDir }` with a shared volume.
