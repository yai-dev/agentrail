# @agentrail/deep-research

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
