# @agentrail/orchestration

## 0.0.2

### Patch Changes

- [#8](https://github.com/yai-dev/agentrail/pull/8) [`1ba73a1`](https://github.com/yai-dev/agentrail/commit/1ba73a1b772835d642934889fc195e5f195bcdf3) Thanks [@yai-dev](https://github.com/yai-dev)! - Fix deep research mode on the playground stream route

  Add stream-route request interception so deep research mode can take over SSE handling, expose a streaming deep-research runner, and wire the playground server to emit deep*research*_ and subagent\__ events while keeping chat mode unchanged. Also fail fast when a spawned sub-agent never becomes ready, mark the orchestration/deep-research runs as failed instead of leaving them stuck in running state, and persist a readable assistant error message back to the session.
