---
"@agentrail/core": minor
"@agentrail/capabilities": minor
"@agentrail/app": minor
---

Add tool permission policy system

Introduces a structured, rule-based permission layer that sits between the LLM
and tool execution, enabling fine-grained control over which operations agents
are allowed to perform.

### @agentrail/core

- New `PermissionDecision` type (`"allow" | "deny" | "ask"` or object form with optional `reason`).
- New optional `checkPermissions(params)` hook on `RuntimeTool` — called after
  `onBeforeToolCall` interceptors but before `validate` and `execute`.
- New `permission_request` `RuntimeEvent` — emitted when `checkPermissions` returns `"ask"`.
- `ToolBuilder` gains a `.checkPermissions()` fluent method.
- `permission_request` is added to `TRACE_PERSISTED_EVENT_TYPES`.

### @agentrail/capabilities

- New `packages/capabilities/src/permissions/` module:
  - `ToolPermissionPolicy` / `PermissionRule` / `PermissionMode` types.
  - `parseRule` / `parseRules` DSL parser (e.g. `"Bash(git:*)"`, `"Write(/workspace/**)"`)
  - `evaluatePolicy` rule engine with priority order: deny → ask → allow → default.
  - `isPathSafe` / `workspaceAnchor` path-safety utilities.
  - `isDangerousCommand` / `isReadOnlyCommand` shell-safety utilities.
- `CapabilityBuildContext` gains optional `permissionPolicy?: ToolPermissionPolicy`.
- Non-sandboxed `bashTool`, `readTool`, `writeTool`, `editTool` are now created via
  factory functions (`createBashTool`, `createReadTool`, `createWriteTool`, `createEditTool`)
  that accept optional `rootDir` and `policy` options; the singleton exports are
  kept for backward compatibility.
- Sandboxed `createSandboxedBash` accepts an optional `policy` parameter.
- All new symbols are exported from the package root.

### @agentrail/app

- `AgentrailProfileContext` gains optional `permissionPolicy?: ToolPermissionPolicy`.
- `defineProfile` propagates `permissionPolicy` from profile context into
  `CapabilityBuildContext`.
- `createAgentApp`, `createStreamRoute`, and `createChatRoute` all accept an
  optional `permissionPolicy` option that is forwarded to every request.
- `AgentrailConfig` (YAML config) gains an optional `permissions` block with
  `mode`, `allow`, `deny`, and `ask` keys.
- `DefaultCapabilityToolOptions` gains optional `permissionPolicy` forwarded to
  sandboxed tools.
