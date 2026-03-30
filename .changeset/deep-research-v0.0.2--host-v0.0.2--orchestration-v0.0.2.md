---
"@agentrail/deep-research": patch
"@agentrail/host": patch
"@agentrail/orchestration": patch
---

Fix deep research mode on the playground stream route

Add stream-route request interception so deep research mode can take over SSE handling, expose a streaming deep-research runner, and wire the playground server to emit deep_research_* and subagent_* events while keeping chat mode unchanged. Also fail fast when a spawned sub-agent never becomes ready, mark the orchestration/deep-research runs as failed instead of leaving them stuck in running state, and persist a readable assistant error message back to the session.
