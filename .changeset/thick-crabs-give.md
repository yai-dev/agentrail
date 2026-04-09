---
"@agentrail/app": patch
"@agentrail/capabilities": patch
---

Add a built-in `Sleep` tool to `@agentrail/capabilities` for bounded wait/backoff patterns, including abort-aware execution and duration clamping.

Include `Sleep` in the default filesystem capability toolset and the compat `buildDefaultCapabilityTools()` execution tools.
