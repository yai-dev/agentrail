# @agentrail/deep-research

## 0.0.12

### Patch Changes

- Updated dependencies [[`3dbbf44`](https://github.com/yai-dev/agentrail/commit/3dbbf4495906baac00b6b3f0b12341eaf127381f), [`72c911f`](https://github.com/yai-dev/agentrail/commit/72c911feea31934dcf1561e71d6a94b8518f0b16)]:
  - @agentrail/core@0.5.0
  - @agentrail/capabilities@0.2.1

## 0.0.11

### Patch Changes

- Updated dependencies [[`f33c7e6`](https://github.com/yai-dev/agentrail/commit/f33c7e6804e7c33bde8f91b4d8c68c9bc623fbbd)]:
  - @agentrail/core@0.4.0
  - @agentrail/capabilities@0.2.0

## 0.0.10

### Patch Changes

- [#128](https://github.com/yai-dev/agentrail/pull/128) [`cbf6935`](https://github.com/yai-dev/agentrail/commit/cbf6935ef041b455717a6fea0d96a472ec858f3d) Thanks [@yai-dev](https://github.com/yai-dev)! - Add package READMEs for all published Agentrail packages and include them in npm publishes. Also add `llms.txt` to the documentation site so AI tools can discover the current docs structure more reliably.

- Updated dependencies [[`cbf6935`](https://github.com/yai-dev/agentrail/commit/cbf6935ef041b455717a6fea0d96a472ec858f3d)]:
  - @agentrail/capabilities@0.1.5
  - @agentrail/core@0.3.2

## 0.0.9

### Patch Changes

- [#127](https://github.com/yai-dev/agentrail/pull/127) [`fd9c649`](https://github.com/yai-dev/agentrail/commit/fd9c6492a337a9b50c9c5a7f94f3e6112f2d4ce8) Thanks [@yai-dev](https://github.com/yai-dev)! - Add generic `Glob`, `WebFetch`, and `WebSearch` tools to `@agentrail/capabilities`, including Brave and Jina search providers.

  Wire `Glob` into the default filesystem capability and compat tool bundle, update deep-research to use the shared web tools, and extend app/CLI config support for Brave and Jina API keys and doctor checks.

- Updated dependencies [[`a1b916c`](https://github.com/yai-dev/agentrail/commit/a1b916c258cb05dff8880dd5abf2f23318e4d1ca), [`fd9c649`](https://github.com/yai-dev/agentrail/commit/fd9c6492a337a9b50c9c5a7f94f3e6112f2d4ce8), [`6235abf`](https://github.com/yai-dev/agentrail/commit/6235abf6a72631aff76cc3a3dd3fb5399e9706e5)]:
  - @agentrail/capabilities@0.1.4
  - @agentrail/core@0.3.1

## 0.0.8

### Patch Changes

- Updated dependencies [[`5a653f6`](https://github.com/yai-dev/agentrail/commit/5a653f62ac61caec15d4017fadf76909552ff9b0)]:
  - @agentrail/core@0.3.0
  - @agentrail/capabilities@0.1.3

## 0.0.7

### Patch Changes

- [#110](https://github.com/yai-dev/agentrail/pull/110) [`4ea5933`](https://github.com/yai-dev/agentrail/commit/4ea5933b1b9bfb831c23e51227fb7c4625abb2f8) Thanks [@yai-dev](https://github.com/yai-dev)! - fix: upgrade dependencies and harden regex patterns against ReDoS
  - Upgrade `hono` to ^4.12.12, `@hono/node-server` to ^1.19.13, and `vite` to ^6.4.2 to address known CVEs
  - Replace `stripHtml` regex chain with `node-html-parser` to eliminate polynomial ReDoS and handle malformed HTML robustly
  - Bound all unbounded quantifiers (`\d+`, ` +`) in compaction and fenced-code-block regexes to prevent ReDoS on crafted input
  - Remove Chinese-only regex fallbacks (`extractOfficialName`, `extractExcludedEntities`, etc.) that were non-functional for non-Chinese users; rely on structured LLM output instead

- Updated dependencies [[`cd58ddc`](https://github.com/yai-dev/agentrail/commit/cd58ddc9afa437cfbfa9bbcf33a82fcfd9acb8da)]:
  - @agentrail/core@0.2.0
  - @agentrail/capabilities@0.1.2

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
