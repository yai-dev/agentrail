# @agentrail/config

## 0.0.2

### Patch Changes

- [#41](https://github.com/yai-dev/agentrail/pull/41) [`58bd795`](https://github.com/yai-dev/agentrail/commit/58bd79566ceb12565dca2e5b6e287f426444070d) Thanks [@yai-dev](https://github.com/yai-dev)! - Remove apiKey from YAML config schema; switch sandbox writeFileInContainer to docker putArchive

  Fixes security issues [#32](https://github.com/yai-dev/agentrail/issues/32) and [#29](https://github.com/yai-dev/agentrail/issues/29). API keys must now be provided via environment variables (ANTHROPIC_API_KEY / OPENAI_API_KEY). writeFileInContainer no longer builds a shell command via string interpolation, eliminating path injection risk.
