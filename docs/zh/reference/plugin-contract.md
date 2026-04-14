# Plugin 契约

插件通过一组紧凑的生命周期契约扩展 Host 行为。

## 适用时机

当需要回答以下问题时，可先阅读本页：

- 某个关注点是否适合放进 Plugin
- 当前 Plugin 生命周期支持哪些钩子
- 如何在不膨胀 Route 或 Profile 的前提下扩展 Host 行为

Plugin 的定位是承载跨 Profile、跨 Route 的 Host 行为，而不是以下内容：

- Runtime 工具
- 托管 Profile
- Route 文件中的逻辑

## 理解方式

Plugin 是一种轻量级 Host 扩展。

适合承载的行为包括：

- 请求拦截
- 请求生命周期副作用
- 额外的 `Context Providers`
- 基于附件生成的上下文注入
- 绑定到 Host 启停的后台服务

不适合放进 Plugin 的，是 Agent 核心推理行为。那部分应放在 Prompt、Tool、Workflow 或 Profile 中。

## 主要能力

当前 Plugin 契约定义在：

- [packages/app/src/host/types.ts](https://github.com/yai-dev/agentrail/blob/main/packages/app/src/host/types.ts)

### `AgentrailPlugin` 接口

```ts
interface AgentrailPlugin {
  /** Stable identifier used in diagnostics and assembly logs */
  name: string;
  /** Semantic version string (e.g. `"1.0.0"`) — recommended for diagnostics */
  version?: string;
  /**
   * Execution order relative to other plugins.
   * Higher values run first during start() and all request-time hooks.
   * stop() runs in reverse order (lowest priority first).
   * Defaults to 0.
   */
  priority?: number;
  /**
   * When true, an error thrown by interceptChatRequest propagates and aborts
   * the request (after being reported to onPluginError).
   * Use for auth/rate-limit plugins where a throw means "deny this request".
   * Defaults to false.
   */
  critical?: boolean;
  /** Runs when the host starts the plugin lifecycle */
  start?(): void | Promise<void>;
  /** Runs when the host shuts plugins down */
  stop?(): void | Promise<void>;
  /** Intercept a chat request before the host runs the normal profile flow */
  interceptChatRequest?(
    context: AgentrailChatRequestContext,
  ): Promise<AgentrailChatHandledResponse | null> | AgentrailChatHandledResponse | null;
  /** Static context providers contributed by this plugin */
  contextProviders?: ContextProvider[];
  /** Inspect uploaded files and return extra context text */
  attachmentHandler?: AttachmentHandler;
  /** Runs at the start of every chat or stream request */
  onRequestStart?(ctx: AgentrailRequestLifecycleContext): void | Promise<void>;
  /**
   * Runs just before each individual tool call executes.
   * Return `{ action: "deny", reason }` to block execution, or
   * `{ action: "allow", input }` to replace the tool arguments.
   */
  onBeforeToolCall?(
    event: BeforeToolCallEvent,
  ): Promise<AppBeforeToolCallResult> | AppBeforeToolCallResult;
  /** Runs after each tool call completes (success or execution error, not deny). */
  onAfterToolCall?(event: AfterToolCallEvent): Promise<void> | void;
  /** Runs after the resulting turn has been persisted */
  onTurnPersisted?(ctx: AgentrailRequestLifecycleContext): void | Promise<void>;
  /** Runs after the request lifecycle completes (last hook to fire per request) */
  onRequestEnd?(ctx: AgentrailRequestLifecycleContext): void | Promise<void>;
}
```

### `AgentrailRequestLifecycleContext`

```ts
interface AgentrailRequestLifecycleContext {
  kind: "chat" | "stream";
  tenantId: string;
  userId: string;
  sessionId: string;
  agentId: string;
}
```

### `AttachmentHandler`

```ts
interface AttachmentFile {
  name: string;
  mimeType: string;
  containerPath: string;
  sizeKb: number;
}

interface AttachmentHandlerResult {
  contextText?: string;
}

type AttachmentHandler = (
  files: AttachmentFile[],
) => Promise<AttachmentHandlerResult | null> | AttachmentHandlerResult | null;
```

### `ContextProvider`

```ts
type ContextProvider = (
  context: { tenantId: string; userId: string; sessionId: string },
  messages: Message[],
) => Promise<Message[]> | Message[];
```

## 契约表面

### `name`

插件的稳定标识，用于诊断与组装。

### `version`

插件实现的可选语义化版本号，格式通常为 `MAJOR.MINOR.PATCH`。建议提供这一字段，因为它会出现在 Host 诊断日志中，便于跨部署环境比对问题。

### `priority`

用于控制插件相对执行顺序。值越高，`start()` 和所有请求期钩子越早执行；`stop()` 则按相反顺序运行。

默认值为 `0`。如果多个插件优先级相同，则按注册顺序执行。

```ts
const authPlugin: AgentrailPlugin = { name: "auth", priority: 100, ... };
const featurePlugin: AgentrailPlugin = { name: "feature", priority: 0, ... };
```

| 阶段                | 顺序           | 说明                                 |
| ------------------- | -------------- | ------------------------------------ |
| `start()`           | 高优先级先执行 | 高优先级插件可能是其他插件的前置依赖 |
| `stop()`            | 低优先级先执行 | 回收顺序与初始化相反                 |
| 请求钩子            | 高优先级先执行 | 认证、策略类插件先于功能插件         |
| `Context Providers` | 高优先级先注入 | 更高优先级的上下文更靠前             |

### `critical`

当该值为 `true` 时，如果 `interceptChatRequest` 抛错，该错误会在报告给 `onPluginError` 后继续向外抛出，并中断请求。

这适合认证、限流、访问策略等插件，在这些场景下，抛错本身就意味着「拒绝当前请求」。

若 `critical` 为 `false`，则该插件错误会被隔离，请求会按插件返回 `null` 的效果继续执行。

### `start` / `stop`

在 Host 启动或关闭插件生命周期时运行。

`start` 适合：

- 启动定时器或后台进程
- 初始化插件自有服务

`stop` 适合：

- 回收在 `start` 中创建的资源

### `interceptChatRequest`

允许插件在 Host 继续执行正常 Profile 流程之前短路或接管聊天请求。

常见用途：

- `Slash Command`
- 管理员专用请求
- 不适合放进主 `Runtime Agent` 的特殊命令解析

返回 `null` 表示继续正常执行；返回响应对象表示直接短路。

### `contextProviders`

用于向 Host 请求管线中追加 `Context Provider` 形式的上下文注入。

适合承载那些应作为请求上下文前置注入，而不是作为工具执行的信息。

### `attachmentHandler`

允许插件检查上传文件，并返回额外的上下文文本。

适合的行为包括：

- 告诉 Agent 当前有哪些上传文件
- 提供按文件类型生成的使用提示
- 在 Runtime 执行前，对附件做轻量解释

### `onRequestStart`

在每次 `chat` 或 `stream` 请求生命周期开始时运行。

常见用途：

- 前台活动追踪
- 存活性标记
- 请求级记账或初始化

### `onTurnPersisted`

在 Host 将当前回合持久化之后、`onRequestEnd` 之前运行。

适合处理那些依赖「当前对话已经可靠落盘」的行为，例如读取刚写入消息并做 memory consolidation。

### `onRequestEnd`

在请求完整结束后运行，是每次请求中的最后一个 hook。适合关闭 span、记录最终指标或清理请求期状态。

### `onBeforeToolCall`

在单次工具调用真正分发前运行，时机位于请求级 hook 之后、工具 `execute()` 之前。

> 仅对象输入约束：只有当工具校验后的顶层输入是 plain object，且不是数组时，这个 hook 才会触发。若工具的顶层 schema 是数组或原始类型，例如 string、number，则不会触发 `onBeforeToolCall`。这与 `input` 的 `Record<string, unknown>` 类型约束一致。

```ts
export interface BeforeToolCallEvent {
  toolName: string;
  input: Record<string, unknown>;
  context: AgentrailProfileContext;
}

export type AppBeforeToolCallResult =
  | { action: "allow" }
  | { action: "deny"; reason: string }
  | { action: "allow"; input: Record<string, unknown> };
```

返回值的语义如下：

| 结果                         | 效果                                     |
| ---------------------------- | ---------------------------------------- |
| `{ action: "allow" }`        | 继续使用原始参数                         |
| `{ action: "allow", input }` | 用 `input` 替换工具参数                  |
| `{ action: "deny", reason }` | 阻止工具调用，模型会把 `reason` 视为错误 |

若插件在此 hook 中抛错，错误会通过 `onPluginError` 上报，然后继续执行下一个插件。抛错本身不会被视为 deny。

多个插件会按 `priority` 从高到低运行。第一个 `deny` 会生效；若某个插件返回了改写后的 `input`，后续插件会收到更新后的输入。

每个插件拿到的都是 `input` 的一份浅拷贝。就地修改不会影响其他插件；若要把变更传递给后续插件，必须通过 `{ action: "allow", input }` 显式返回。

常见用途：

- 审计日志
- 合规检查
- 输入清洗
- 凭据剥离
- 路径访问限制

### `onAfterToolCall`

在工具 `execute()` 返回后运行。无论执行成功还是抛出执行错误，都会触发；但以下两种情况不会触发：

1. `onBeforeToolCall` 返回 `{ action: "deny" }`
2. 工具校验后的输入不是 plain object

```ts
export interface AfterToolCallEvent {
  toolName: string;
  input: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  context: AgentrailProfileContext;
}
```

如果这个 hook 抛错，错误会通过 `onPluginError` 上报，但不会影响返回给模型的工具结果。

常见用途：

- 执行审计
- 时延指标
- 结果脱敏

## 完整示例

下面的示例组合了多种 hook：

```ts
import type { AgentrailPlugin, ContextProvider } from "@agentrail/app";

const datestampProvider: ContextProvider = async (ctx, messages) => {
  return [
    {
      role: "user",
      content: `[System note: Today is ${new Date().toISOString().slice(0, 10)}. Tenant: ${
        ctx.tenantId
      }]`,
    },
    ...messages,
  ];
};

let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

export const observabilityPlugin: AgentrailPlugin = {
  name: "observability",
  version: "1.0.0",
  priority: 10,

  start() {
    heartbeatTimer = setInterval(() => {
      console.log(JSON.stringify({ event: "heartbeat", ts: Date.now() }));
    }, 60_000);
  },

  stop() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  },

  interceptChatRequest(ctx) {
    if (ctx.request.message === "/ping") {
      return { status: 200, body: { text: "pong" } };
    }
    return null;
  },

  contextProviders: [datestampProvider],

  attachmentHandler(files) {
    if (files.length === 0) return null;
    const list = files.map((f) => `- ${f.name} (${f.mimeType}, ${f.sizeKb} KB)`).join("\n");
    return { contextText: `Uploaded files:\n${list}` };
  },

  onRequestStart(ctx) {
    console.log(JSON.stringify({ event: "request_start", ...ctx }));
  },

  onRequestEnd(ctx) {
    console.log(JSON.stringify({ event: "request_end", ...ctx }));
  },

  onTurnPersisted(ctx) {
    console.log(JSON.stringify({ event: "turn_persisted", sessionId: ctx.sessionId }));
  },
};
```

在高层路径中，可通过 `createAgentApp` 注册：

```ts
import { createAgentApp } from "@agentrail/app";
import { observabilityPlugin } from "./plugins/observability.js";

const app = createAgentApp({
  dataDir: DATA_DIR,
  profiles: [defaultProfile],
  plugins: [observabilityPlugin],
});
```

若直接使用 route primitives，也可以这样传入：

```ts
import { createStreamRoute } from "@agentrail/app/advanced";
import { observabilityPlugin } from "./plugins/observability.js";

app.route(
  "/api/stream",
  createStreamRoute({
    plugins: [observabilityPlugin],
  }),
);
```

## 错误隔离

所有 Plugin hooks 都以每个插件为粒度做 `try/catch` 包裹。除非该插件设置了 `critical: true`，否则单个插件的错误不会传播到请求调用方。

### 各 hook 的错误策略

| Hook                                   | 出错时的行为                                   |
| -------------------------------------- | ---------------------------------------------- |
| `start()`                              | 上报给 `onPluginError`，然后重新抛出，启动中止 |
| `stop()`                               | 上报后继续，确保所有插件都有机会停止           |
| `onRequestStart/End/onTurnPersisted`   | 上报后继续                                     |
| `interceptChatRequest`（non-critical） | 上报后跳过该插件，等价于返回 `null`            |
| `interceptChatRequest`（critical）     | 上报后重新抛出，请求中止                       |
| `attachmentHandler`                    | 上报后跳过该插件结果，继续合并其他插件结果     |
| `onBeforeToolCall`                     | 上报后继续下一个插件，不视为 deny              |
| `onAfterToolCall`                      | 上报后继续，工具结果不受影响                   |

### `onPluginError` 回调

如果希望把 Plugin 错误接入自己的日志或 tracing 系统，可向 `createAgentApp()` 和 `runPluginLifecycle()` 传入 `onPluginError`：

```ts
import type { PluginErrorHandler } from "@agentrail/app";
import { createAgentApp, runPluginLifecycle } from "@agentrail/app";

const onPluginError: PluginErrorHandler = async ({ plugin, hook, error }) => {
  await myLogger.warn({ plugin, hook, err: error }, "plugin hook failed");
};

void runPluginLifecycle(plugins, "start", onPluginError);

const app = createAgentApp({
  plugins,
  onPluginError,
});
```

该回调既可以是同步函数，也可以是异步函数。host 会等待其完成后，再决定继续还是重新抛出。如果回调自身再次抛错，host 会退回 `console.error`，而不会让主请求流程受到回调不稳定性的影响。

当未提供 `onPluginError` 时，默认行为是写入 `console.warn`。

## 执行模型

当前 Plugin 运行期辅助函数位于：

- [packages/app/src/host/plugins.ts](https://github.com/yai-dev/agentrail/blob/main/packages/app/src/host/plugins.ts)

当前执行模型的关键特征包括：

- 插件按 `priority` 从高到低执行；相同优先级按注册顺序执行
- 请求钩子顺序等待执行
- 聊天拦截器在第一个返回 handled response 的插件处停止
- 附件处理结果通过拼接 `contextText` 合并
- 所有 hook 都按单个插件隔离错误，单个插件抛错不会影响其他插件

## 仓库中的参考示例

playground 示例在这里组装插件：

- [examples/playground-server/src/plugins/index.ts](https://github.com/yai-dev/agentrail/blob/main/examples/playground-server/src/plugins/index.ts)

当前示例插件包括：

- `Slash Commands`
- attachment hints
- user-memory integration

这些实现适合作为参考，因为每个插件都只负责一项横切关注点，而不是把所有行为堆进一个大插件。

## 适合放进 Plugin 的内容

适合的场景：

- `Slash Command` 拦截
- 活动与存活性追踪
- 请求级 `Context Providers`
- 附件元信息提示
- 由生命周期管理的后台任务

不适合的场景：

- 本应由工具承担的领域推理
- 本应写在 Profile 中的 `System Prompt` 身份
- 属于应用启动层的 route 组装
- 应独立成包的重型工作流编排

## 设计意图

Plugin 应负责跨 Profile、跨 Route 的 Host 行为，而不是本应位于 `Runtime Tool` 或 Profile 中的 Agent 行为。

判断一个关注点是否适合放进 Plugin，可以使用一个简单问题：

> 如果应用存在多个 profile 和多个 route，这个行为是否仍然存在？

如果答案是「是」，它通常更适合放进 Plugin。

## 相关文档

- [编写插件](../guides/write-a-plugin.md)
- [Profile 契约](./profile-contract.md)
- [Host 原语](./host-primitives.md)

## 说明

本页已覆盖当前 plugin contract 的主要接口与运行时行为。若需要逐字对照完整英文内容，可继续阅读 [英文原文](../../reference/plugin-contract.md)。
