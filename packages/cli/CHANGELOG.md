# @agentrail/cli

## 0.2.3

### Patch Changes

- Updated dependencies [[`f33c7e6`](https://github.com/yai-dev/agentrail/commit/f33c7e6804e7c33bde8f91b4d8c68c9bc623fbbd)]:
  - @agentrail/app@0.4.0

## 0.2.2

### Patch Changes

- [#128](https://github.com/yai-dev/agentrail/pull/128) [`cbf6935`](https://github.com/yai-dev/agentrail/commit/cbf6935ef041b455717a6fea0d96a472ec858f3d) Thanks [@yai-dev](https://github.com/yai-dev)! - Add package READMEs for all published Agentrail packages and include them in npm publishes. Also add `llms.txt` to the documentation site so AI tools can discover the current docs structure more reliably.

- Updated dependencies [[`cbf6935`](https://github.com/yai-dev/agentrail/commit/cbf6935ef041b455717a6fea0d96a472ec858f3d)]:
  - @agentrail/app@0.3.2

## 0.2.1

### Patch Changes

- [#127](https://github.com/yai-dev/agentrail/pull/127) [`fd9c649`](https://github.com/yai-dev/agentrail/commit/fd9c6492a337a9b50c9c5a7f94f3e6112f2d4ce8) Thanks [@yai-dev](https://github.com/yai-dev)! - Add generic `Glob`, `WebFetch`, and `WebSearch` tools to `@agentrail/capabilities`, including Brave and Jina search providers.

  Wire `Glob` into the default filesystem capability and compat tool bundle, update deep-research to use the shared web tools, and extend app/CLI config support for Brave and Jina API keys and doctor checks.

- Updated dependencies [[`a1b916c`](https://github.com/yai-dev/agentrail/commit/a1b916c258cb05dff8880dd5abf2f23318e4d1ca), [`fd9c649`](https://github.com/yai-dev/agentrail/commit/fd9c6492a337a9b50c9c5a7f94f3e6112f2d4ce8), [`6235abf`](https://github.com/yai-dev/agentrail/commit/6235abf6a72631aff76cc3a3dd3fb5399e9706e5)]:
  - @agentrail/app@0.3.1

## 0.2.0

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
  - @agentrail/app@0.3.0
