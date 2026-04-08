# @agentrail/deep-research

## 0.0.6

### Patch Changes

- [#95](https://github.com/yai-dev/agentrail/pull/95) [`432f684`](https://github.com/yai-dev/agentrail/commit/432f684679ef019c4c06466c7b303a4d623e73b7) Thanks [@yai-dev](https://github.com/yai-dev)! - Finish the session storage and sandbox execution cleanup across the framework packages.
  - Replace cross-package `sessionDir` plumbing with `SessionRef`-driven session storage and persistence adapters in host, memo, orchestration, and deep-research.
  - Add a session trace store so runtime trace persistence no longer relies on application code hard-coding trace file paths.
  - Split sandbox execution into strict foreground execution plus Bash-specific background execution with Dockerode-backed timeout handling.
  - Update the default tool and TODO storage integrations to use the new session storage abstractions.

- Updated dependencies [[`745db0d`](https://github.com/yai-dev/agentrail/commit/745db0d1de52ceab85146fc5c89fb2361f536003), [`432f684`](https://github.com/yai-dev/agentrail/commit/432f684679ef019c4c06466c7b303a4d623e73b7)]:
  - @agentrail/capabilities@0.1.1

## 0.0.5

### Patch Changes

- Updated dependencies [[`aac05e2`](https://github.com/yai-dev/agentrail/commit/aac05e2c4f1ce7150729010d73a4429af3f987f8)]:
  - @agentrail/runtime-core@0.1.0
  - @agentrail/knowledge@0.0.3
  - @agentrail/orchestration@0.0.4
  - @agentrail/sandbox@0.0.3

## 0.0.4

### Patch Changes

- Updated dependencies [[`58bd795`](https://github.com/yai-dev/agentrail/commit/58bd79566ceb12565dca2e5b6e287f426444070d), [`7feaa9b`](https://github.com/yai-dev/agentrail/commit/7feaa9baca6a3e8ed2b69bf6930fd069db1a9ab7), [`f2716be`](https://github.com/yai-dev/agentrail/commit/f2716be16589f1a5d0097a258e8529cbf51fd8ba)]:
  - @agentrail/sandbox@0.0.2
  - @agentrail/prompts@0.0.2
  - @agentrail/runtime-core@0.0.2
  - @agentrail/knowledge@0.0.2
  - @agentrail/orchestration@0.0.3

## 0.0.3

### Patch Changes

- [#14](https://github.com/yai-dev/agentrail/pull/14) [`46c2ecd`](https://github.com/yai-dev/agentrail/commit/46c2ecd7b731e95236e2f57f745b53cd12bd4b02) Thanks [@yai-dev](https://github.com/yai-dev)! - Add create-agentrail-app scaffold CLI and fix Deep Research evidence table errors
  - New package `create-agentrail-app`: interactive CLI that scaffolds a minimal Agentrail server project. Queries the npm registry at runtime to pin the latest versions of all framework dependencies. Generated project includes a Hono server, a basic agent with context compaction, session/sandbox managers, and dev tooling.
  - Fix `@agentrail/deep-research`: LLM sometimes returns `conflicts` or `notes` fields as a string instead of an array, causing `.map is not a function` at runtime. Added a `toStringArray` utility that coerces either form to `string[]`, applied in `normalizeEvidenceTable`; added defensive `?? []` guards in the report-generation path.

## 0.0.2

### Patch Changes

- [#8](https://github.com/yai-dev/agentrail/pull/8) [`1ba73a1`](https://github.com/yai-dev/agentrail/commit/1ba73a1b772835d642934889fc195e5f195bcdf3) Thanks [@yai-dev](https://github.com/yai-dev)! - Fix deep research mode on the playground stream route

  Add stream-route request interception so deep research mode can take over SSE handling, expose a streaming deep-research runner, and wire the playground server to emit deep*research*\_ and subagent\_\_ events while keeping chat mode unchanged. Also fail fast when a spawned sub-agent never becomes ready, mark the orchestration/deep-research runs as failed instead of leaving them stuck in running state, and persist a readable assistant error message back to the session.

- Updated dependencies [[`1ba73a1`](https://github.com/yai-dev/agentrail/commit/1ba73a1b772835d642934889fc195e5f195bcdf3)]:
  - @agentrail/orchestration@0.0.2
