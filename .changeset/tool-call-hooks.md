---
"@agentrail/core": minor
"@agentrail/app": minor
---

Add `onBeforeToolCall` / `onAfterToolCall` plugin hooks and `ToolInterceptor` core interface.

**`@agentrail/core`**

- New `ToolInterceptor` interface with `onBeforeToolCall` and `onAfterToolCall` methods, exported from the package root.
- New related types: `BeforeToolCallResult`, `ToolInterceptorBeforeContext`, `ToolInterceptorAfterContext`.
- `AgentRunOptions` gains an optional `toolInterceptor` field that threads the interceptor into every tool execution.
- `tool.before` stream event gains a `rawArgs` field that always carries the original model-generated arguments. `args` now reflects the effective (post-interceptor) input that was actually passed to the tool.

**`@agentrail/app`**

- `AgentrailPlugin` gains two new optional hooks:
  - `onBeforeToolCall(event)` — called before each tool executes; can allow, modify, or deny the call.
  - `onAfterToolCall(event)` — called after each tool completes (success or error, not deny).
- New exported types: `BeforeToolCallEvent`, `AfterToolCallEvent`, `AppBeforeToolCallResult`.
- New `buildToolInterceptor(plugins, profileCtx, onError)` helper that composes plugin hooks in priority order with `safeNotify` error isolation.
- Hooks are only dispatched for tools whose validated input is a plain object; array- and primitive-typed tools skip both hooks.
- Corrected plugin lifecycle order in JSDoc: `onTurnPersisted` fires before `onRequestEnd`.
