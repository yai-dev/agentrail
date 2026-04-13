# Tool Permissions

Control which tool calls an agent is allowed to execute, and how unapproved calls are handled.

## Prerequisites

Read this guide after:

- [Quickstart](quickstart.md)
- [Add Tools](add-tools.md)

## How It Works

Every tool call passes through a permission check before execution. The check returns one of three decisions:

| Decision | Meaning |
|----------|---------|
| `"allow"` | Execution proceeds immediately. |
| `"deny"` | Execution is blocked; the model receives an error result. |
| `"ask"` | Execution is suspended until the host approves or rejects the call. |

The `ToolPermissionPolicy` you provide to `createAgentApp` drives this check.

## Defining a Policy

### Inline policy

Build a policy directly using `parseRules` from `@agentrail/capabilities`:

```ts
import { createAgentApp } from "@agentrail/app";
import { parseRules } from "@agentrail/capabilities";

const app = createAgentApp({
  permissionPolicy: {
    mode: "default",
    allow: [],
    deny: parseRules(["Bash(rm:*)"]),   // block destructive shell commands
    ask: parseRules(["Bash", "Write"]), // require approval for everything else
  },
});
```

### Loading from `agentrail.yaml`

Use `configPermissionsToPolicy` to convert the YAML config block into a runtime policy:

```ts
import { createAgentApp, loadAgentrailConfig, configPermissionsToPolicy } from "@agentrail/app";

const config = loadAgentrailConfig();
const app = createAgentApp({
  permissionPolicy: config.permissions
    ? configPermissionsToPolicy(config.permissions)
    : undefined,
});
```

The corresponding YAML block:

```yaml
permissions:
  mode: default
  ask:
    - "Bash"
    - "Write"
  deny:
    - "Bash(rm:*)"
```

## Rule DSL

Rules are strings of the form `ToolName` or `ToolName(content-pattern)`.

| Rule | Matches |
|------|---------|
| `"Bash"` | Any Bash call |
| `"Bash(git:*)"` | Bash calls whose command starts with `git:` |
| `"Bash(git:**)"` | Same — `**` spans `/` too, useful for multi-segment paths |
| `"Write"` | Any file write |
| `"Write(/workspace/*)"` | Writes to files directly under `/workspace/` |
| `"Write(/workspace/**)"` | Writes to any path under `/workspace/` |

Rules are **prefix-anchored**: `Bash(git:*)` matches any command beginning with `git:`, including chained forms like `git:status; rm -rf /`. For strong shell isolation use the sandboxed environment.

## Evaluation Order

Rules are evaluated as: **deny → ask → allow → default**.

The first matching rule in the highest-priority list wins. When no rule matches, the `mode` field determines the outcome.

## Modes

| Mode | Effect |
|------|--------|
| `"default"` | Unmatched calls are allowed; `"ask"` triggers interactive approval. |
| `"strict"` | Unmatched calls are **denied**. Use to build an explicit allowlist. |
| `"acceptEdits"` | `"ask"` decisions on `Write` and `Edit` are auto-approved. |
| `"dontAsk"` | `"ask"` decisions are demoted to `"deny"` (headless environments). |
| `"bypassPermissions"` | All calls are unconditionally allowed (trusted automation only). |

### Strict allowlist example

```ts
{
  mode: "strict",
  allow: parseRules([
    "Bash(git:*)",
    "Bash(npm:*)",
    "Read",
  ]),
  deny: [],
  ask: [],
}
```

Everything not listed here is denied without any user prompt.

## Interactive Approval (`"ask"`)

When a tool call matches an `ask` rule and the host provides a `PermissionApprovalHandler`, the runtime:

1. Emits a `permission_request` event on the SSE stream.
2. **Suspends** the tool call.
3. Waits for the handler to resolve.
4. Emits a `permission_resolved` event and either continues or returns an error result to the model.

Wire up the handler via `createPermissionApprovalHandler` in `createStreamRoute`:

```ts
import { createStreamRoute } from "@agentrail/app/advanced";

const stream = createStreamRoute({
  // ...
  createPermissionApprovalHandler: (sessionId) => ({
    async requestApproval({ toolCallId, toolName, reason, signal }) {
      // suspend until the user responds — resolve "approved" or "rejected"
      return waitForUserDecision(sessionId, toolCallId, { signal });
    },
  }),
});
```

When no handler is registered, `"ask"` behaves like `"deny"` (backward-compatible fallback).

## UI Integration

The SSE stream emits `permission_request` and `permission_resolved` events. A client can listen for these to show an approval prompt and POST the user's decision back to the server.

### 1. Consume events from the stream

```ts
for await (const event of streamChat(sessionId, message)) {
  if (event.type === "permission_request") {
    // { type, toolCallId, toolName, reason? }
    setPendingPermission({
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      reason: event.reason,
    });
  } else if (event.type === "permission_resolved" || event.type === "turn.complete") {
    setPendingPermission(null);
  }
}
```

### 2. Send the user's decision to the server

POST to `/api/sessions/:sessionId/respond` with `kind: "permission"`:

```ts
async function respondToPermission(
  sessionId: string,
  decision: "approved" | "rejected",
): Promise<boolean> {
  const res = await fetch(`/api/sessions/${sessionId}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "permission", decision }),
  });
  return res.ok;
}
```

The server resolves the suspended wait handle and the agent run continues (or receives a rejection error result).

### 3. Render an approval prompt

Only show the prompt when a `permission_request` is pending. Dismiss it only **after** the POST succeeds to avoid hiding the prompt on network failure:

```tsx
function PermissionPrompt({ sessionId, pending, onDismiss }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Reset state when a new request arrives (consecutive approvals).
  useEffect(() => {
    setSubmitting(false);
    setError(null);
  }, [pending?.toolCallId]);

  if (!pending) return null;

  const respond = async (decision) => {
    setSubmitting(true);
    const ok = await respondToPermission(sessionId, decision);
    if (ok) {
      onDismiss();
    } else {
      setError("Failed — please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div>
      <p>Allow <strong>{pending.toolName}</strong> to run?</p>
      {pending.reason && <p>{pending.reason}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      <button disabled={submitting} onClick={() => respond("approved")}>
        {submitting ? "…" : "Approve"}
      </button>
      <button disabled={submitting} onClick={() => respond("rejected")}>
        {submitting ? "…" : "Reject"}
      </button>
    </div>
  );
}
```

Key points:

- **Reset state on new request** — `useEffect` keyed on `toolCallId` prevents button state leaking across consecutive approval prompts.
- **Dismiss after success** — call `onDismiss` only when `respondToPermission` returns `true`; on failure restore the buttons so the user can retry.
- **Disable during POST** — prevent double-submission while the request is in flight.

## Per-Tool `checkPermissions`

Individual tools can also enforce their own permission logic independently of the global policy. Define `checkPermissions` on `defineTool`:

```ts
import { defineTool } from "@agentrail/core";

export const sensitiveOp = defineTool({
  name: "sensitive_op",
  description: "An operation that requires explicit approval.",
  parameters: Type.Object({ target: Type.String() }),
  checkPermissions({ params }) {
    if (params.target.startsWith("/etc/")) {
      return { decision: "ask", reason: "Modifying system files requires approval." };
    }
    return "allow";
  },
  async execute(params) { /* ... */ },
});
```

The global policy and per-tool `checkPermissions` are both evaluated; the stricter result wins.

## Runtime Events

| Event type | When emitted |
|-----------|-------------|
| `permission_request` | A tool call is suspended waiting for approval. |
| `permission_resolved` | The approval decision has been made (`decision: "approved" \| "rejected"`). |

Subscribe to these on your SSE stream to build custom approval UIs or audit logs.

## Related Docs

- [Add Tools](add-tools.md)
- [`createAgentApp` Reference](../reference/create-agent-app.md)
- `createStreamRoute` in `@agentrail/app/advanced`
