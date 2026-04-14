# Host 原语

Host 原语是较低层的请求编排接口，位于 `@agentrail/app/advanced`。

## 适用时机

当出现以下情况时，可先阅读本页：

- `createAgentApp` 已不够用
- 需要在 Route 层或生命周期层做更细控制
- 希望理解 `createAgentApp` 实际封装了哪些原语

如果应用只是普通托管场景，仍然应优先使用 `createAgentApp`。

## 什么时候应直接使用 Host 原语

通常只有在以下情况才值得直接使用：

- 请求生命周期与默认流程明显不同
- 需要自定义的 Profile 解析规则，`resolveProfile` 已无法覆盖
- 想保留部分标准能力，但自行组装 Context Pipeline
- 需要自定义 Streaming 或编排行为
- 要把 Agentrail 接入现有服务架构，而无法直接采用 `createAgentApp`

如果当前并不确定是否真的需要这些控制，通常就还不应使用这一层。

## 导入方式

```ts
import { createChatRoute, createStreamRoute } from "@agentrail/app/advanced";
```

## 主要 API

- `createChatRoute`
- `createStreamRoute`
- `createOrchestrationRegistry`
- `composeTransformContexts`
- `createTransformContext`
- `createContextProviderFromTransform`
- `runPluginLifecycle`

## Route 工厂

### `createChatRoute`

这是非流式的 Host 入口。它负责：

- 请求解析与校验
- Session 解析
- Profile 解析
- Context Pipeline 解析
- Plugin 级聊天拦截
- Agent 调用
- 回合持久化

适合需要普通 Request / Response 语义，而不需要 SSE 的场景。

最小示例：

```ts
import { createChatRoute } from "@agentrail/app/advanced";
import { SessionManager } from "@agentrail/app";
import { createStaticProfileResolver } from "@agentrail/app";

app.route(
  "/api/chat",
  createChatRoute({
    defaultAgentId: "default",
    sessionStore: new SessionManager(dataDir),
    summarize: async (messages) => {
      return messages.map((m) => String("content" in m ? m.content : "")).join("\n");
    },
    compaction: { triggerTokens: 80_000, minMessages: 20 },
    resolveProfile: createStaticProfileResolver([defaultProfile]),
  }),
);
```

### `createStreamRoute`

这是流式 Host 入口。在基础请求生命周期之上，还额外负责：

- 附件持久化
- SSE 事件转发
- Compaction 信号前置通知
- 可选的编排事件转发
- 与 Workspace 相关的流式行为

适合以下场景：

- 需要增量 Runtime Events
- 需要看到 Compaction 过程
- 需要看到编排过程
- 需要长时间 Tool 执行反馈

最小示例：

```ts
import { createStreamRoute } from "@agentrail/app/advanced";
import { SessionManager, createStaticProfileResolver } from "@agentrail/app";
import { SandboxManager } from "@agentrail/capabilities";

app.route(
  "/api/stream",
  createStreamRoute({
    dataDir,
    defaultAgentId: "default",
    sessionStore: new SessionManager(dataDir),
    sandboxManager: new SandboxManager(dataDir),
    resolveProfile: createStaticProfileResolver([defaultProfile]),
    summarize,
    compaction: { triggerTokens: 80_000, minMessages: 20 },
    plugins,
  }),
);
```

## Profile 解析

### `createStaticProfileResolver`

这个函数来自主入口 `@agentrail/app`，用于从固定 Profile 列表中构建一个简单 Resolver。

```ts
import { createStaticProfileResolver } from "@agentrail/app";

const resolveProfile = createStaticProfileResolver([supportProfile, researchProfile]);
```

如果需要租户驱动或策略驱动的路由，则应直接实现 `ProfileResolver`。

## Context Pipeline 辅助函数

### `composeTransformContexts`

用于把多个改写函数按从左到右的顺序串联起来，然后再做 `Context Provider` 注入。

### `createTransformContext`

把一组有序的 `ContextProvider` 转成 Runtime 所需的 `transformContext` 形式。也可以接受一个基础改写函数，此时 `Context Providers` 会在改写后的历史之上运行。

### `createContextProviderFromTransform`

把旧式或 Runtime 风格的 Transform 逻辑适配回 `Context Provider` 形式。

这个辅助函数现在主要用于兼容场景。若逻辑会改写或删除已有消息，更推荐直接实现 `getTransformContext`，或使用 Capability 的 `buildTransformContext`。

## 编排接入

### `createOrchestrationRegistry`

用于管理按 Session 隔离的编排管理器，以及按需初始化运行状态。

```ts
import { createOrchestrationRegistry } from "@agentrail/app/advanced";

const orchestrationRegistry = createOrchestrationRegistry({ dataDir });
```

## Session Store 边界

所有 Host 原语都依赖 `AgentrailSessionStore` 契约，而不是某个具体的 Session Manager。

这意味着可以替换成：

- 默认的文件系统版 `SessionManager`
- 自定义兼容 Store
- 未来任何满足契约的非文件系统后端

## 典型自定义 Host 流程

一个自定义 Host 通常会包含以下步骤：

1. 构建或注入 Session Store
2. 构建 Profile Resolver
3. 组装 Plugins
4. 组装 `Context Providers` 或 `Transform Context`
5. 挂载 `createChatRoute` 和 / 或 `createStreamRoute`

这一层原语的设计目标，就是允许只替换其中某一步，而不必重写整条链路。

## 建议

对大多数应用，仍然建议优先使用 `createAgentApp`。只有当某个局部环节确实需要自定义控制时，再下探到 `@agentrail/app/advanced`。

## 相关文档

- [Profile 契约](./profile-contract.md)
- [Plugin 契约](./plugin-contract.md)
- [兼容 API](./host-defaults.md)
- [英文原文](../../reference/host-primitives.md)
