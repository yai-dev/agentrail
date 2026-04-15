# 添加工具

先在 Runtime 层定义工具，再把工具组装到托管的 Profile 中。

## 适用时机

建议在读完以下内容后阅读本页：

- [快速开始](./quickstart.md)
- [构建 Profile](./build-a-profile.md)
- [Agent](../concepts/agents.md)

在 Agentrail 中，工具首先是 Runtime 关注点，其次才是 Host 关注点：

- Runtime 定义工具是什么
- Host 决定某个 Profile 暴露哪些工具

这层拆分的意义在于，工具逻辑可以在托管应用、工作流和多个 Profile 之间复用。

## 两个层级

大多数项目会在两个位置处理工具：

1. 工具实现
   定义工具契约和执行逻辑。
2. 工具组装
   决定某个托管 Profile 或 Workflow 对外暴露哪些工具。

Agentrail 有意将这两部分分开。

## 主要方式

### 使用 `@agentrail/capabilities`

如果框架已经提供所需能力，优先使用内建 capability。

常见例子包括：

- 询问用户
- 写入待办或任务进度
- 文件系统、浏览器、知识库、编排相关工具

这是最快的接入路径。可以在 Profile 中直接添加 capability：

```ts
import { defineProfile } from "@agentrail/app";
import { filesystem } from "@agentrail/capabilities";

export const defaultProfile = defineProfile({
  id: "default",
  name: "Default Assistant",
  agent: {
    model: "anthropic:claude-sonnet-4-5",
    prompt: "You are a helpful assistant.",
  },
  capabilities: [filesystem({ sandboxManager })],
});
```

### 定义自定义 Runtime 工具

当满足以下条件时，使用 `@agentrail/core` 的 `defineTool()`：

- 应用需要领域专用工具
- 逻辑属于 Runtime 执行，而不是 Host 路由
- 希望同一个工具被多个 Profile 复用

这通常适用于：

- 产品内数据查询
- 内部业务动作
- 可复用的 Agent 能力

### 在 `defineProfile` 中组装工具

自定义工具可以直接传给 `defineProfile`，也可以与 capability 混合使用：

```ts
import { defineProfile } from "@agentrail/app";
import { filesystem } from "@agentrail/capabilities";
import { customerLookupTool } from "./tools/customer-lookup.js";

export const supportProfile = defineProfile({
  id: "support",
  name: "Support Assistant",
  agent: {
    model: "anthropic:claude-sonnet-4-5",
    prompt: "You are a support assistant.",
    tools: [customerLookupTool],
  },
  capabilities: [filesystem({ sandboxManager })],
});
```

这种方式适合组合以下几类能力：

- 自定义领域工具
- 内建 capability 工具
- 应用专用的辅助工具

## 最小自定义工具示例

```ts
import { Type } from "@sinclair/typebox";
import { defineTool } from "@agentrail/core";

export const customerLookupTool = defineTool({
  name: "customer_lookup",
  description: "Look up customer details by account id.",
  parameters: Type.Object({
    accountId: Type.String(),
  }),
  async execute(params) {
    return {
      content: [
        {
          type: "text",
          text: `Customer ${params.accountId} is active.`,
        },
      ],
      details: { accountId: params.accountId, status: "active" },
    };
  },
});
```

重点不在于辅助函数名称，而在于工具应保持 Runtime 可复用，不依赖 Route glue。

## 添加业务校验

可以通过可选的 `validate` 字段增加前置校验。它会在 schema 校验和插件层参数改写之后、`execute` 之前运行。

返回 `{ valid: false, reason }` 会终止执行，并向模型返回可见错误消息：

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
    return {
      content: [{ type: "text", text: "Transfer complete." }],
      details: null,
    };
  },
});
```

当校验失败时，Agent 会收到 `"Tool precondition failed: <reason>"`。如果 `validate` 抛错，则抛出的消息会作为原因。两种情况下都不会执行 `execute`，也不会触发 `onAfterToolCall`。

## 推荐组装模式

当工具数量开始增加时，建议在 Host 或 Profile 层统一组装，而不是散落在各个 Route 中。

常见模式如下：

1. 在包内或应用本地的 Runtime 模块中定义可复用工具。
2. 在单独位置构建工具列表。
3. 把工具列表传给 Profile 的 `agent.tools` 或动态 `createAgent`。

这样可以保持 Route 文件精简，并避免重复声明工具列表。

## 仓库中的参考位置

当前仓库里，相关实现主要在：

- `packages/capabilities/src/`：capability descriptor 工厂，例如 `filesystem`、`knowledge`、`orchestration`
- `packages/app/src/profile/define-profile.ts`：`defineProfile` 如何从 capability descriptor 组装工具

适合用来参考以下问题：

- 如何构建 capability 风格的工具组
- 如何把多个工具组整合成 Profile 可消费的列表

## 工具应该放在哪里

可按以下经验判断：

- 可复用的领域工具或能力工具，放在 `packages/*`
- 只服务于示例的工具，放在对应 example 应用内部
- 工具执行逻辑不要写进 Route 文件

如果一个「工具」已经依赖 HTTP 请求解析、Route 语义或纯 UI 行为，它通常不再是 Runtime 工具。

## 常见误区

避免以下做法：

- 在每个 Route 里分别组装一套工具
- 把 Prompt 行为写进工具实现
- 用 Plugin 承担本应由 Runtime 工具负责的逻辑
- 在可复用工具工厂里硬编码应用专用环境解析

## 建议

尽量把可复用工具工厂放在包内，把 Profile 专用的组装逻辑留在 Host 层。

能用 defaults 或 capability 层解决时，优先使用现成能力；只有在应用确实需要时，再增加自定义工具。

## 相关文档

- [构建 Profile](./build-a-profile.md)
- [添加上下文](./add-context.md)
- [使用能力包](./use-capability-packages.md)

## 下一步

定义好工具后，通常下一步是补上请求期上下文，让 agent 在调用工具前拿到正确环境信息。可继续阅读 [添加上下文](./add-context.md)。
