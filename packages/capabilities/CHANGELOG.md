# @agentrail/capabilities

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
