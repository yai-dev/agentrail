---
"@agentrail/capabilities": patch
"@agentrail/deep-research": patch
"@agentrail/app": patch
"@agentrail/cli": patch
---

Add generic `Glob`, `WebFetch`, and `WebSearch` tools to `@agentrail/capabilities`, including Brave and Jina search providers.

Wire `Glob` into the default filesystem capability and compat tool bundle, update deep-research to use the shared web tools, and extend app/CLI config support for Brave and Jina API keys and doctor checks.
