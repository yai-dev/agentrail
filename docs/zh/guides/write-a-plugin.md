# 编写插件

当一个行为需要跨多个 Profile 或 Route 生效时，插件是推荐的承载方式。

## 适用时机

建议在读完以下内容后阅读本页：

- [快速开始](./quickstart.md)
- [插件](../concepts/plugins.md)

当行为符合以下条件时，应优先考虑插件：

- 作用于多个 Profile 或 Route，例如请求日志
- 需要生命周期钩子，例如启动与停止
- 需要在 Agent 运行前拦截请求，例如 `Slash Command`
- 需要注入与 Profile 无关的上下文

如果行为属于 Agent 自身的推理或业务动作，应放到工具或 Prompt 中。

## 插件契约

插件实现 `@agentrail/app` 提供的 `AgentrailPlugin` 接口：

```ts
import type { AgentrailPlugin } from "@agentrail/app";
```

除 `name` 外，其余字段都可选。只实现真正需要的钩子即可。

## 最小示例：请求日志

```ts
import type { AgentrailPlugin } from "@agentrail/app";

export const requestLoggerPlugin: AgentrailPlugin = {
  name: "request-logger",

  onRequestStart(context) {
    console.log(
      `[${context.kind}] ${context.agentId} — user=${context.userId} session=${context.sessionId}`,
    );
  },

  onRequestEnd(context) {
    console.log(`[${context.kind}] ${context.agentId} — done`);
  },
};
```

## 拦截聊天请求

可以通过 `interceptChatRequest` 在正常 Agent 流程之前短路或接管请求。返回响应对象表示已处理，返回 `null` 表示继续走默认流程：

```ts
export const maintenanceModePlugin: AgentrailPlugin = {
  name: "maintenance-mode",

  async interceptChatRequest(context) {
    if (context.request.message.startsWith("/ping")) {
      return {
        status: 200,
        body: { message: "pong", sessionId: null },
      };
    }
    return null;
  },
};
```

第一个返回非 `null` 的插件会终止后续插件执行。

## 添加上下文 Provider

使用 `contextProviders` 可以向每次请求的上下文窗口注入额外消息，也就是追加 `Context Provider`：

```ts
export const timezonePlugin: AgentrailPlugin = {
  name: "timezone-context",

  contextProviders: [
    async (context, _messages) => {
      return [
        {
          role: "user" as const,
          content: `Current server time: ${new Date().toISOString()}`,
          timestamp: Date.now(),
        },
      ];
    },
  ],
};
```

这些消息会在对话历史之前插入上下文。

## 生命周期钩子

`start` 和 `stop` 适合承载与 Host 进程绑定的后台服务：

```ts
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

export const heartbeatPlugin: AgentrailPlugin = {
  name: "heartbeat",

  start() {
    heartbeatTimer = setInterval(() => {
      console.log("heartbeat", new Date().toISOString());
    }, 60_000);
  },

  stop() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  },
};
```

## 注册插件

把插件数组传给 `createAgentApp`：

```ts
import { createAgentApp } from "@agentrail/app";

const app = createAgentApp({
  dataDir: DATA_DIR,
  profiles: [defaultProfile],
  plugins: [requestLoggerPlugin, timezonePlugin],
});
```

如果需要更底层的控制，也可以把 `plugins` 直接传给 `@agentrail/app/advanced` 提供的 `createChatRoute` 或 `createStreamRoute`。

## 执行顺序

- 插件按注册顺序执行
- 生命周期钩子 `onRequestStart`、`onRequestEnd`、`onTurnPersisted` 会顺序等待
- 聊天拦截器会在第一个处理请求的插件处停止
- 所有插件的 `contextProviders` 会被合并

## 不适合放进插件的内容

- 领域内推理：使用 Tool
- 系统提示词身份：放进 Profile Prompt
- Route 组合：属于应用启动层
- 重型工作流编排：放进专门的 Workflow 包

## 相关文档

- [Plugin 契约](../reference/plugin-contract.md)
- [构建 Profile](./build-a-profile.md)
- [插件](../concepts/plugins.md)
