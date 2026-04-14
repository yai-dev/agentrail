# 工具

工具是 Agent 在执行过程中调用的函数。它负责把语言模型的推理结果连接到真实动作或外部系统。

## 工具由什么组成

在 `@agentrail/core` 中，一个 `RuntimeTool` 通常包含五个核心部分：

| 部分          | 用途                                   |
| ------------- | -------------------------------------- |
| `name`        | 发送给 LLM 的工具标识                  |
| `label`       | 面向日志与 UI 的可读名称               |
| `description` | 供模型判断何时调用该工具的自然语言描述 |
| `parameters`  | 使用 TypeBox 定义的输入 schema         |
| `execute`     | 执行工具逻辑并返回结果                 |

LLM 不会直接执行工具。模型只会返回结构化工具调用请求，Agent loop 再负责参数校验、执行与结果回填。

## 定义工具

大多数情况下，使用 `defineTool()`：

```ts
import { Type } from "@sinclair/typebox";
import { defineTool } from "@agentrail/core";

export const customerLookupTool = defineTool({
  name: "customer-lookup",
  label: "Customer Lookup",
  description: "Look up a customer by account ID.",
  parameters: Type.Object({
    accountId: Type.String({ description: "The account identifier" }),
  }),
  async execute(params) {
    const record = await db.customers.findById(params.accountId);
    return {
      content: [{ type: "text", text: JSON.stringify(record) }],
      details: record,
    };
  },
});
```

无参工具可以使用 `defineSimpleTool()`：

```ts
import { defineSimpleTool } from "@agentrail/core";

export const pingTool = defineSimpleTool({
  name: "ping",
  description: "Check that the service is reachable.",
  async execute() {
    return { content: [{ type: "text", text: "pong" }], details: null };
  },
});
```

## 业务校验

如果输入结构正确，但不满足业务前提，可以通过 `validate` 追加校验：

```ts
import { Type } from "@sinclair/typebox";
import { defineTool } from "@agentrail/core";

export const transferTool = defineTool({
  name: "transfer_funds",
  description: "Transfer an amount between two accounts.",
  parameters: Type.Object({
    fromAccountId: Type.String(),
    toAccountId: Type.String(),
    amount: Type.Number({ minimum: 0.01 }),
  }),
  async validate(params) {
    const balance = await getBalance(params.fromAccountId);
    if (balance < params.amount) {
      return { valid: false, reason: "Insufficient funds" };
    }
    return { valid: true };
  },
  async execute(params) {
    await doTransfer(params.fromAccountId, params.toAccountId, params.amount);
    return { content: [{ type: "text", text: "Transfer complete." }], details: null };
  },
});
```

当 `validate` 返回 `{ valid: false, reason }` 或抛错时，`execute` 不会被调用，模型会收到 `Tool precondition failed: <reason>`。

## 工具结果

每个工具都要返回 `ToolResult`：

```ts
{
  content: (TextContent | ImageContent)[];
  details: TDetails;
}
```

- `content`：返回给模型可见的结果
- `details`：留给 Host、日志、UI 或调试层使用的结构化数据

## 长任务中的进度更新

对于执行时间较长的工具，可以通过 `ctx.onUpdate` 发送中间结果，Host 会将其转发为 `tool.update` 事件。

## 工具从哪里来

在托管应用中，工具通常来自三类来源：

### 1. 自定义运行时工具

业务代码自行定义的工具，通常位于业务仓库或应用内模块中，再通过 Profile 注入。

### 2. `@agentrail/capabilities`

框架提供的通用能力包，包括：

- 文件系统与浏览器工具
- 知识库检索
- 技能调用
- 多 Agent 编排
- 提问、待办写入等通用工具

### 3. 编排工具

当 Profile 接入编排能力后，父 Agent 会获得 `spawn-agent`、`send-input`、`wait-agent`、`close-agent` 等工具，用于创建与协调子 Agent。

## 在 Profile 中组装工具

工具应当在 `defineProfile` 中组装，而不是写在路由里：

```ts
import { defineProfile } from "@agentrail/app";
import { filesystem } from "@agentrail/capabilities";

export const defaultProfile = defineProfile({
  id: "default",
  name: "Default Assistant",
  agent: {
    model: "anthropic:claude-sonnet-4-5",
    prompt: systemPrompt,
    tools: [customerLookupTool, pingTool],
  },
  capabilities: [filesystem({ sandboxManager })],
});
```

`defineProfile` 会自动把 `agent.tools` 与能力包生成的工具合并。

## 不适合放进工具的内容

以下内容不建议写成工具：

- HTTP 请求解析与路由逻辑
- Session 管理
- 系统提示词本身
- 跨请求的 Host 行为

这些内容分别更适合放在路由、Host、Profile 或插件层。

## 相关文档

- [Agent](agents.md)
- [构建 Profile](../guides/build-a-profile.md)
- [`createAgentApp` 参考](../reference/create-agent-app.md)
