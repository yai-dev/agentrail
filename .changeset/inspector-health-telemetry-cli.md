---
"@agentrail/app": minor
"@agentrail/core": minor
"@agentrail/cli": minor
"@agentrail/create-agentrail-app": minor
---

Add Inspector API, health route, telemetry sink, and CLI package

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
