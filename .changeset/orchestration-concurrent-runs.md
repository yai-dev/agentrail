---
"@agentrail/orchestration": patch
---

Support multiple concurrent orchestration runs in a single `OrchestrationManager`.

`OrchestrationSnapshot` now stores `runs` instead of a single `run`, and spawn/complete flows now bind explicitly to a `runId`.

Potential breaking change for consumers using internal orchestration APIs directly:
- `OrchestrationSnapshot.run` is replaced by `OrchestrationSnapshot.runs`.
- `spawnAgent` and `completeRun` require an explicit `runId`.
