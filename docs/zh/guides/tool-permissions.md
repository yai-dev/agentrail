# 工具权限

工具权限用于控制 agent 可以执行哪些工具调用，以及未获批准的调用应如何处理。

## 适用时机

建议在读完以下内容后阅读本页：

- [快速开始](./quickstart.md)
- [添加工具](./add-tools.md)

## 工作方式

每次工具调用在执行前都会经过一次权限检查。检查结果只有三种：

| 决策      | 含义                           |
| --------- | ------------------------------ |
| `"allow"` | 立即执行                       |
| `"deny"`  | 阻止执行，模型会收到错误结果   |
| `"ask"`   | 暂停执行，等待 Host 批准或拒绝 |

传给 `createAgentApp` 的 `ToolPermissionPolicy` 会驱动这次检查。

## 定义策略

### 内联策略

可以直接用 `@agentrail/capabilities` 的 `parseRules` 构造策略：

```ts
import { createAgentApp } from "@agentrail/app";
import { parseRules } from "@agentrail/capabilities";

const app = createAgentApp({
  permissionPolicy: {
    mode: "default",
    allow: [],
    deny: parseRules(["Bash(rm:*)"]),
    ask: parseRules(["Bash", "Write"]),
  },
});
```

这里的含义是：

- 禁止破坏性 shell 命令
- 其余 `Bash` 和 `Write` 调用都需要审批

### 从 `agentrail.yaml` 加载

也可以使用 `configPermissionsToPolicy`，把 YAML 配置块转换成运行期策略：

```ts
import { createAgentApp, loadAgentrailConfig, configPermissionsToPolicy } from "@agentrail/app";

const config = loadAgentrailConfig();
const app = createAgentApp({
  permissionPolicy: config.permissions ? configPermissionsToPolicy(config.permissions) : undefined,
});
```

对应的 YAML 片段：

```yaml
permissions:
  mode: default
  ask:
    - "Bash"
    - "Write"
  deny:
    - "Bash(rm:*)"
```

## 规则 DSL

规则字符串的形式是 `ToolName` 或 `ToolName(content-pattern)`。

| 规则                     | 匹配内容                              |
| ------------------------ | ------------------------------------- |
| `"Bash"`                 | 任意 Bash 调用                        |
| `"Bash(git:*)"`          | 命令以 `git:` 开头的 Bash 调用        |
| `"Bash(git:**)"`         | 同样匹配 `git:` 开头，`**` 可跨越 `/` |
| `"Write"`                | 任意文件写入                          |
| `"Write(/workspace/*)"`  | 仅匹配 `/workspace/` 直接子文件       |
| `"Write(/workspace/**)"` | 匹配 `/workspace/` 下任意层级文件     |

这些规则都以开头为锚点。比如 `Bash(git:*)` 会匹配任何以 `git:` 开头的命令，包括像 `git:status; rm -rf /` 这样的链式命令。若需要更强的 shell 隔离，应结合 sandbox。

## 求值顺序

规则按以下顺序求值：`deny → ask → allow → default`。

优先级更高列表中的第一个命中规则会生效。如果所有规则都未命中，则由 `mode` 决定结果。

## 模式

| 模式                  | 效果                                           |
| --------------------- | ---------------------------------------------- |
| `"default"`           | 未命中的调用默认允许；`"ask"` 会触发交互式审批 |
| `"strict"`            | 未命中的调用一律拒绝，适合显式允许列表         |
| `"acceptEdits"`       | 对 `Write` 和 `Edit` 的 `"ask"` 自动批准       |
| `"dontAsk"`           | 把 `"ask"` 降级为 `"deny"`，适合无交互环境     |
| `"bypassPermissions"` | 无条件允许所有调用，仅适用于完全可信的自动化   |

### `strict` 允许列表示例

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

这里未列出的调用都会被直接拒绝。

## 交互式审批：`"ask"`

当工具调用命中 `ask` 规则，且 Host 提供了 `PermissionApprovalHandler` 时，运行时会：

1. 在 SSE 流中发出 `permission_request` 事件
2. 暂停工具调用
3. 等待 Handler 返回结果
4. 发出 `permission_resolved` 事件，并继续执行或返回拒绝错误

在 `createStreamRoute` 中可通过 `createPermissionApprovalHandler` 接入：

```ts
import { createStreamRoute } from "@agentrail/app/advanced";

const stream = createStreamRoute({
  createPermissionApprovalHandler: (sessionId) => ({
    async requestApproval({ toolCallId, toolName, reason, signal }) {
      return waitForUserDecision(sessionId, toolCallId, { signal });
    },
  }),
});
```

如果没有注册 handler，`"ask"` 会按 `"deny"` 处理。这是向后兼容的回退行为。

## UI 接入

SSE 流会发出 `permission_request` 和 `permission_resolved` 事件。客户端可以监听这两个事件，显示审批提示，并把用户决策回传给服务端。

### 1. 读取流中的事件

```ts
for await (const event of streamChat(sessionId, message)) {
  if (event.type === "permission_request") {
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

### 2. 把用户决策发回服务端

向 `/api/sessions/:sessionId/respond` 发起 `POST`，请求体中 `kind` 为 `"permission"`：

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

服务端会解除挂起的 `wait handle`，并让 Agent 继续执行，或向模型返回拒绝结果。

### 3. 渲染审批提示

只有当存在待处理的 `permission_request` 时才应显示审批提示。提示应在 `POST` 成功后再关闭，以免网络失败时界面提前消失：

```tsx
function PermissionPrompt({ sessionId, pending, onDismiss }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

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
      <p>
        Allow <strong>{pending.toolName}</strong> to run?
      </p>
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

这里有三个要点：

- 新请求到达时，基于 `toolCallId` 重置状态，避免按钮状态串到下一次审批
- 只有在 `respondToPermission` 返回 `true` 后才调用 `onDismiss`
- `POST` 进行期间禁用按钮，避免重复提交

## 工具级 `checkPermissions`

单个工具也可以定义自己的权限逻辑，而不完全依赖全局策略。可在 `defineTool` 上定义 `checkPermissions`：

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
  async execute(params) {
    /* ... */
  },
});
```

全局策略与工具自身的 `checkPermissions` 会同时求值，其中更严格的结果生效。

## 相关文档

- [添加工具](./add-tools.md)
- [故障排查](./troubleshooting.md)
- [createAgentApp 参考](../reference/create-agent-app.md)
