# @agentrail/app

## 0.1.1

### Patch Changes

- [#88](https://github.com/yai-dev/agentrail/pull/88) [`9a65760`](https://github.com/yai-dev/agentrail/commit/9a65760c82e23d4a632abcea66af55e58e099e6a) Thanks [@yai-dev](https://github.com/yai-dev)! - Sort the assembled tool list alphabetically by name in `createDefaultToolset` to ensure a deterministic tool order across requests.

  Previously, tool order depended on import order and conditional inclusion, which could vary between requests and invalidate the LLM provider's prompt cache, incurring full input token costs on every call.

- [#95](https://github.com/yai-dev/agentrail/pull/95) [`432f684`](https://github.com/yai-dev/agentrail/commit/432f684679ef019c4c06466c7b303a4d623e73b7) Thanks [@yai-dev](https://github.com/yai-dev)! - Finish the session storage and sandbox execution cleanup across the framework packages.
  - Replace cross-package `sessionDir` plumbing with `SessionRef`-driven session storage and persistence adapters in host, memo, orchestration, and deep-research.
  - Add a session trace store so runtime trace persistence no longer relies on application code hard-coding trace file paths.
  - Split sandbox execution into strict foreground execution plus Bash-specific background execution with Dockerode-backed timeout handling.
  - Update the default tool and TODO storage integrations to use the new session storage abstractions.

- Updated dependencies [[`745db0d`](https://github.com/yai-dev/agentrail/commit/745db0d1de52ceab85146fc5c89fb2361f536003), [`432f684`](https://github.com/yai-dev/agentrail/commit/432f684679ef019c4c06466c7b303a4d623e73b7)]:
  - @agentrail/capabilities@0.1.1
