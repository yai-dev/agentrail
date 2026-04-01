# @agentrail/prompts

## 0.0.2

### Patch Changes

- [#44](https://github.com/yai-dev/agentrail/pull/44) [`7feaa9b`](https://github.com/yai-dev/agentrail/commit/7feaa9baca6a3e8ed2b69bf6930fd069db1a9ab7) Thanks [@yai-dev](https://github.com/yai-dev)! - Fix sandbox error swallowing, budgetUsedPct hardcoding, and prompt cache leaking

  Fixes [#21](https://github.com/yai-dev/agentrail/issues/21): replace `void ensureSandbox(...)` with a stored promise that is
  awaited inside the streamText callback; failures are surfaced as an SSE error
  event so clients are immediately aware of sandbox startup problems.

  Fixes [#25](https://github.com/yai-dev/agentrail/issues/25): add optional `contextWindow` field to `AgentrailProfile`; stream
  route uses `profile.contextWindow ?? 200_000` instead of the hardcoded 200k,
  giving correct budget percentages for GPT-4o, Gemini, and other models.

  Fixes [#30](https://github.com/yai-dev/agentrail/issues/30): introduce `PromptLoader` class with instance-level mtime cache;
  `createPromptBuilder` now creates a private `PromptLoader` per builder so
  caches never bleed between instances or between test runs.
