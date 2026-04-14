# 构建 Profile

当希望由 Host 层在每次请求时负责构建 Agent，应使用 Profile。

## 前置阅读

建议先阅读：

- [快速开始](quickstart.md)
- [Agent](../concepts/agents.md)
- [`createAgentApp` 参考](../reference/create-agent-app.md)

## Profile 负责什么

一个 Profile 通常负责定义：

- Profile 的 ID 与显示名称
- 模型配置
- 系统提示词
- 可选工具与能力包

通常不负责：

- 路由挂载
- Session 存储
- Sandbox 生命周期
- 插件启动与关闭
- 无关的后台任务

这些更适合放在 Host 层。

## 推荐方式

常见流程如下：

1. 用 `defineProfile` 定义 `agent: { model, prompt }`
2. 将 Profile 数组传给 `createAgentApp({ profiles: [...] })`

## 最小示例

```ts
import { defineProfile } from "@agentrail/app";

export const supportProfile = defineProfile({
  id: "support",
  name: "Support Agent",
  agent: {
    model: "anthropic:claude-sonnet-4-5",
    prompt: `You are a customer support assistant.
Ask clarifying questions when the request is ambiguous.
Use tools only when needed.`,
    maxTurns: 20,
  },
});
```

然后在入口文件中挂到 `createAgentApp`：

```ts
import { createAgentApp } from "@agentrail/app";
import { supportProfile } from "./profiles/support.js";

const app = createAgentApp({
  dataDir: DATA_DIR,
  profiles: [supportProfile],
});
```

## Prompt 的接入方式

Profile 中的提示词通常有两种写法：

- 静态字符串：适合小型应用
- 异步函数 `(ctx) => string`：适合依赖租户、环境或缓存构建器的情况

随着应用复杂度上升，建议尽早切到 Prompt SDK，而不是把长提示词直接写在 Profile 文件中。

## 动态构建 Agent

如果需要完全按请求上下文构建 Agent，可以使用 `createAgent`：

```ts
import { defineAgent } from "@agentrail/core";
import { defineProfile } from "@agentrail/app";

export const supportProfile = defineProfile({
  id: "support",
  name: "Support Agent",
  async createAgent(ctx) {
    const system = await loadTenantPrompt(ctx.tenantId);
    return defineAgent({
      id: "support",
      model: { provider: "anthropic", modelId: "claude-sonnet-4-5" },
      system,
      maxTurns: 20,
    });
  },
});
```

推荐保持这部分代码：

- 规模小
- 可预测
- 不含 HTTP 细节
- 不在内部解析环境变量

## 注册多个 Profile

一个 Host 可以同时暴露多个 Profile：

```ts
const app = createAgentApp({
  dataDir: DATA_DIR,
  profiles: [supportProfile, researchProfile],
});
```

适合多 Profile 的情况包括：

- 一个客服助手与一个研究助手
- 一个默认聊天入口与一个专项工作流
- 面向不同租户或不同产品面的独立配置

如果差异只是一两个字符串，不建议拆成多个 Profile。

## 常见问题

应避免以下做法：

- 把路由逻辑写进 Profile
- 在 `createAgent` 内直接读取环境变量
- 在 Profile 文件内嵌很长的系统提示词
- 为了极小差异复制多个 Profile

## 下一步

在 Profile 基础上，下一步通常是：

1. 补工具与能力包
2. 补上下文提供器
3. 补插件行为

建议继续阅读：

- [工具](../concepts/tools.md)
- [`createAgentApp` 参考](../reference/create-agent-app.md)
- [管理 Prompt](./manage-prompts.md)
