# @agentrail/create-agentrail-app

## 0.1.0

### Minor Changes

- [#14](https://github.com/yai-dev/agentrail/pull/14) [`46c2ecd`](https://github.com/yai-dev/agentrail/commit/46c2ecd7b731e95236e2f57f745b53cd12bd4b02) Thanks [@yai-dev](https://github.com/yai-dev)! - Add create-agentrail-app scaffold CLI and fix Deep Research evidence table errors

  - New package `create-agentrail-app`: interactive CLI that scaffolds a minimal Agentrail server project. Queries the npm registry at runtime to pin the latest versions of all framework dependencies. Generated project includes a Hono server, a basic agent with context compaction, session/sandbox managers, and dev tooling.
  - Fix `@agentrail/deep-research`: LLM sometimes returns `conflicts` or `notes` fields as a string instead of an array, causing `.map is not a function` at runtime. Added a `toStringArray` utility that coerces either form to `string[]`, applied in `normalizeEvidenceTable`; added defensive `?? []` guards in the report-generation path.
