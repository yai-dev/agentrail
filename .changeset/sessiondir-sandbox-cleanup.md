---
"@agentrail/deep-research": patch
"@agentrail/host": patch
"@agentrail/memo": patch
"@agentrail/orchestration": patch
"@agentrail/sandbox": patch
"@agentrail/tools": patch
---

Finish the session storage and sandbox execution cleanup across the framework packages.

- Replace cross-package `sessionDir` plumbing with `SessionRef`-driven session storage and persistence adapters in host, memo, orchestration, and deep-research.
- Add a session trace store so runtime trace persistence no longer relies on application code hard-coding trace file paths.
- Split sandbox execution into strict foreground execution plus Bash-specific background execution with Dockerode-backed timeout handling.
- Update the default tool and TODO storage integrations to use the new session storage abstractions.
