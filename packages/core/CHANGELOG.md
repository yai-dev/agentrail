# @agentrail/core

## 0.4.0

### Minor Changes

- [#131](https://github.com/yai-dev/agentrail/pull/131) [`f33c7e6`](https://github.com/yai-dev/agentrail/commit/f33c7e6804e7c33bde8f91b4d8c68c9bc623fbbd) Thanks [@yai-dev](https://github.com/yai-dev)! - Persist oversized tool result text to session storage during compaction when callers provide a `sessionDir` through the memory context. `compactToolResults` is now async and should be awaited by direct callers.

  Recent tool results are still preserved by default, but extremely large recent outputs are now compacted immediately to avoid overflowing the next model request.

  Profiles and capabilities can now contribute request-time history rewrites via transform contexts. `memoryContext(...)` now supplies both injected context providers and a real transform path, so tool-result compaction rewrites are applied to model-facing messages instead of being discarded by provider adaptation.

  Long-running turns now support reactive compaction in the agent loop. Agentrail can micro-compact or full-compact older API rounds before the next model call, and can retry once after prompt-too-long errors by compacting in-memory request history.

  The playground session history API now restores context-window usage from the latest assistant message usage when available, keeping the reloaded UI indicator aligned with the live `context_usage` stream event instead of inflating it with per-request aggregate usage.

## 0.3.2

### Patch Changes

- [#128](https://github.com/yai-dev/agentrail/pull/128) [`cbf6935`](https://github.com/yai-dev/agentrail/commit/cbf6935ef041b455717a6fea0d96a472ec858f3d) Thanks [@yai-dev](https://github.com/yai-dev)! - Add package READMEs for all published Agentrail packages and include them in npm publishes. Also add `llms.txt` to the documentation site so AI tools can discover the current docs structure more reliably.

## 0.3.1

### Patch Changes

- [#124](https://github.com/yai-dev/agentrail/pull/124) [`a1b916c`](https://github.com/yai-dev/agentrail/commit/a1b916c258cb05dff8880dd5abf2f23318e4d1ca) Thanks [@yai-dev](https://github.com/yai-dev)! - Fix incremental session persistence and text streaming during tool-using turns, and harden orchestration run startup against concurrent first-spawn races.

  Update the playground UI to align more closely with the inspector visual language, remove the trace tab from the workspace, and refine responsive behavior across the deep research and agent team panels.

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

## 0.2.0

### Minor Changes

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
