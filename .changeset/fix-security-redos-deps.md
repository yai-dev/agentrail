---
"@agentrail/app": patch
"@agentrail/deep-research": patch
---

fix: upgrade dependencies and harden regex patterns against ReDoS

- Upgrade `hono` to ^4.12.12, `@hono/node-server` to ^1.19.13, and `vite` to ^6.4.2 to address known CVEs
- Replace `stripHtml` regex chain with `node-html-parser` to eliminate polynomial ReDoS and handle malformed HTML robustly
- Bound all unbounded quantifiers (`\d+`, ` +`) in compaction and fenced-code-block regexes to prevent ReDoS on crafted input
- Remove Chinese-only regex fallbacks (`extractOfficialName`, `extractExcludedEntities`, etc.) that were non-functional for non-Chinese users; rely on structured LLM output instead
