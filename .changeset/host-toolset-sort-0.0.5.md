---
"@agentrail/host": patch
---

Sort the assembled tool list alphabetically by name in `createDefaultToolset` to ensure a deterministic tool order across requests.

Previously, tool order depended on import order and conditional inclusion, which could vary between requests and invalidate the LLM provider's prompt cache, incurring full input token costs on every call.
