# @agentrail/create-agentrail-app

## 0.1.1

### Patch Changes

- [#17](https://github.com/yai-dev/agentrail/pull/17) [`0ef15c2`](https://github.com/yai-dev/agentrail/commit/0ef15c2a2a290c77e90e60afa300e0bf03e403a3) Thanks [@yai-dev](https://github.com/yai-dev)! - Fix missing shebang line causing CLI to fail on execution

  Added `#!/usr/bin/env node` as the first line of `src/index.ts` so the compiled `dist/index.js` is correctly identified as a Node.js script by the OS. Without this, running `npx @agentrail/create-agentrail-app` failed with "Permission denied" and "Syntax error" because the shell tried to interpret the JavaScript file as a shell script.

## 0.1.0

### Minor Changes

- [#14](https://github.com/yai-dev/agentrail/pull/14) [`46c2ecd`](https://github.com/yai-dev/agentrail/commit/46c2ecd7b731e95236e2f57f745b53cd12bd4b02) Thanks [@yai-dev](https://github.com/yai-dev)! - Add create-agentrail-app scaffold CLI and fix Deep Research evidence table errors
  - New package `create-agentrail-app`: interactive CLI that scaffolds a minimal Agentrail server project. Queries the npm registry at runtime to pin the latest versions of all framework dependencies. Generated project includes a Hono server, a basic agent with context compaction, session/sandbox managers, and dev tooling.
  - Fix `@agentrail/deep-research`: LLM sometimes returns `conflicts` or `notes` fields as a string instead of an array, causing `.map is not a function` at runtime. Added a `toStringArray` utility that coerces either form to `string[]`, applied in `normalizeEvidenceTable`; added defensive `?? []` guards in the report-generation path.
