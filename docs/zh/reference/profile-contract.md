# Profile 契约

Profile 是连接 Host 层与 Runtime Agent 的桥梁。

## 适用时机

当需要回答以下问题时，可先阅读本页：

- 哪些内容应放进 Profile
- `AgentrailProfile` 的底层契约是什么
- 应用逐步变复杂后，如何保持 Profile 边界清楚

## 理解方式

Host 会在每次请求时回答一个问题：

> 应由哪个 profile 处理这次请求，以及应如何构建它对应的 agent？

因此，profile 位于以下两者之间：

- Host 的请求生命周期代码
- Runtime Agent 的构建逻辑

Profile 不是 Route 对象，也不是 Plugin。它负责的是 Agent 的身份与组装契约。

## 推荐 API：`defineProfile`

定义 Profile 的推荐方式是使用 `@agentrail/app` 提供的 `defineProfile`：

```ts
import { defineProfile } from "@agentrail/app";
import { defineAgent } from "@agentrail/core";
```

### 静态形式

```ts
export const analyticsProfile = defineProfile({
  id: "analytics",
  name: "Analytics Agent",
  agent: {
    model: "openai:gpt-4o",
    prompt: async (ctx) => loadSystemPrompt(ctx.tenantId),
    maxTurns: 20,
  },
  capabilities: [filesystem({ sandboxManager })],
});
```

### 动态形式：按请求创建 agent

```ts
export const analyticsProfile = defineProfile({
  id: "analytics",
  name: "Analytics Agent",
  async createAgent(ctx) {
    const system = await loadSystemPrompt(ctx.tenantId);
    return defineAgent({
      id: "analytics",
      model: { provider: "openai", modelId: "gpt-4o" },
      system,
      maxTurns: 20,
    });
  },
  capabilities: [filesystem({ sandboxManager })],
  modelConfig: { provider: "openai", modelId: "gpt-4o" },
});
```

## 基础契约：`AgentrailProfile`

底层 `Profile` 契约定义在：

- [packages/app/src/host/types.ts](https://github.com/yai-dev/agentrail/blob/main/packages/app/src/host/types.ts)

```ts
interface AgentrailProfileContext {
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionRef: SessionRef;
  sessionStore: AgentrailSessionStore;
  chainId?: string;
  permissionPolicy?: ToolPermissionPolicy;
}

interface AgentrailProfile {
  id: string;
  name: string;
  contextWindow?: number;
  createAgent(
    context: AgentrailProfileContext,
    onSubAgentEvent?: (event: object) => void,
  ): Promise<Agent>;
  getContextProviders?(
    context: AgentrailProfileContext,
  ): Promise<ContextProvider[]> | ContextProvider[];
  getTransformContext?(
    context: AgentrailProfileContext,
  ): Promise<TransformContextFn> | TransformContextFn;
}
```

在最基础的层面，Profile 至少需要提供 `id`、`name` 和 `createAgent`。这些工作通过 `defineProfile` 都可以自动完成。

### `contextWindow`

可选字段，表示模型的上下文窗口大小，单位为 token，默认值为 `200_000`。

`Stream Route` 会使用这个值计算 SSE 事件中的 `budgetUsedPct`。如果直接实现底层 `AgentrailProfile`，应尽量填写真实值。

这个字段属于底层 `AgentrailProfile` 契约。当前 `defineProfile` 尚未把 `contextWindow` 暴露为高层辅助选项，因此只有在直接实现自定义 profile 对象时才需要设置。

## `ProfileDefinition`

`defineProfile` 返回的是 `ProfileDefinition`，它在 `AgentrailProfile` 的基础上增加了：

```ts
interface ProfileDefinition extends AgentrailProfile {
  readonly capabilities?: CapabilityDescriptor[];
  readonly modelConfig?: Partial<ModelConfig>;
}
```

其中 `capabilities` 会被 `createAgentApp` 用来构建上下文 `Provider` 与 capability 级请求 `Transform`。

## Profile Resolver

如果需要自定义解析逻辑，可实现 `Profile Resolver`：

```ts
import type { ProfileResolver } from "@agentrail/app";

export const resolveProfile: ProfileResolver = async ({ agentId, tenantId }) => {
  return await loadProfileForTenant(agentId, tenantId);
};
```

然后传给 `createAgentApp({ resolveProfile })`，或直接传给 `@agentrail/app/advanced` 中的 `createChatRoute`、`createStreamRoute`。

若只是基于静态列表解析，可直接使用 `createStaticProfileResolver`：

```ts
import { createStaticProfileResolver } from "@agentrail/app";

const resolveProfile = createStaticProfileResolver([analyticsProfile, supportProfile]);
```

## 合理的 Profile 边界

一个边界清楚的 Profile，通常负责：

- Agent 身份
- prompt 集成
- Agent 创建
- Profile 本地的上下文补充

一个边界清楚的 Profile，通常不负责：

- session 持久化
- HTTP 请求解析
- 服务启动
- plugin 生命周期
- 无关的后台任务

## 仓库中的参考示例

当前推荐示例位于：

- [examples/playground-server/src/profiles/default-profile.ts](https://github.com/yai-dev/agentrail/blob/main/examples/playground-server/src/profiles/default-profile.ts)

这个文件展示了：

- 使用静态 agent 配置定义 `defineProfile`
- 按请求渲染 prompt 函数
- 针对文件系统、浏览器、知识库、skills 和编排的 capability descriptors
- 通过 `createStaticProfileResolver` 完成注册

## 常见误区

避免以下做法：

- 在 Profile 中处理 Route 组装或 Plugin 启动
- 在 profile 逻辑里直接读取本应属于应用层的环境变量
- 用一个超大的 Profile 承担多个明显不同的 Agent 职责
- 本可通过 prompt 变量或工具选项解决，却复制出多份高度相似的 Profile

## 建议

尽量让 Profile 保持声明式，并把与 Profile 无关的基础设施放在定义之外。

如果一时拿不准，可先问一个问题：

> 这是关于如何构建 Agent，还是关于如何运行服务？

如果是后者，通常就不应放进 Profile。

## 相关文档

- [构建 Profile](../guides/build-a-profile.md)
- [兼容 API](./host-defaults.md)
- [Host 原语](./host-primitives.md)
