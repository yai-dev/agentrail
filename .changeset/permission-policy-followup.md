---
"@agentrail/capabilities": minor
"@agentrail/app": minor
---

Fix and extend the tool permission policy system:

- Add `"strict"` `PermissionMode`: deny-by-default mode where only operations listed in `allow` are permitted. Use for minimal-privilege configurations.
- Add `contentMode: "path" | "command"` parameter to `matchPattern` and `evaluatePolicy`. Bash tools now pass `"command"` so that `*` wildcards match across `/` in command arguments (e.g. `git:add src/main.ts` matches `Bash(git:*)`).
- Fix missing `?` in regex escape list — a literal `?` in a pattern no longer acts as an optional quantifier.
- Fix cross-platform ancestor resolution in `path-safety.ts` using `path.dirname` loop instead of POSIX-specific `split`/`join`.
- Fix `normalizeBashCommand` to handle tab and other whitespace between verb and arguments.
- Export `ContentMatchMode` type from `@agentrail/capabilities`.
- `AgentrailPermissionsConfig.mode` and `agentrail.yaml` now accept `"strict"` as a valid permissions mode.
