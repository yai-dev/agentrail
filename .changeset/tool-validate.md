---
"@agentrail/core": minor
---

Add optional `validate()` method to `RuntimeTool` for two-phase tool input validation.

**`@agentrail/core`**

- New `ToolValidationContext` interface (`{ toolCallId, signal? }`) and `ValidationResult` type (`{ valid: true } | { valid: false; reason: string }`), both exported from the package root.
- `RuntimeTool` gains an optional `validate(params, ctx)` method. When present, it is called after TypeBox schema validation and after any `onBeforeToolCall` interceptor rewrites, but before `execute`. Returning `{ valid: false, reason }` or throwing surfaces a `"Tool precondition failed: <reason>"` error result to the model; `execute` and `onAfterToolCall` are not called.
- `defineTool()` and the fluent `tool()` builder accept an optional `validate` field / `.validate()` method with the same signature.
- `defineSimpleTool()` accepts an optional `validate` field (no `params` argument, only `ctx`) for parameter-less tools.
- New `validateToolInput(tool, input)` helper in `validation.ts` that reuses the existing `Value.Check + Value.Errors + ToolValidationError` path. The executor uses it to re-validate arguments after an interceptor rewrites them, ensuring schema invariants hold before `validate()` or `execute()` run.
