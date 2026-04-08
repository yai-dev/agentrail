---
"@agentrail/app": patch
---

refactor: split stream-route into single-responsibility modules

Dissolves `stream-route-internals.ts` and decomposes `stream-route.ts` into
focused modules (`stream-request.ts`, `attachment-pipeline.ts`, `sse-writer.ts`,
`context-resolver.ts`, `compaction-runner.ts`, `sandbox-warmup.ts`). No
behavior changes — pure internal restructuring for maintainability.
