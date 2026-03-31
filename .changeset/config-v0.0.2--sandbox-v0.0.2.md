---
"@agentrail/config": patch
"@agentrail/sandbox": patch
---

Remove apiKey from YAML config schema; switch sandbox writeFileInContainer to docker putArchive

Fixes security issues #32 and #29. API keys must now be provided via environment variables (ANTHROPIC_API_KEY / OPENAI_API_KEY). writeFileInContainer no longer builds a shell command via string interpolation, eliminating path injection risk.
