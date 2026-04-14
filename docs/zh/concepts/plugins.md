# 插件

插件用于在 Host 层添加跨 Profile、跨 Route 的横切行为。这些行为通常不适合写进 Profile、Route 或 Runtime 工具。

## 插件是什么

插件是一个实现 `@agentrail/app` 中 `AgentrailPlugin` 接口的轻量对象。它可以接入以下环节：

- 进程生命周期，例如启动与停止
- 单次请求生命周期，例如开始、结束、回合持久化完成
- 聊天请求拦截，例如处理 `Slash Command` 或特殊输入
- 上下文注入，在请求进入 Agent 前补充消息
- 附件处理，对上传文件生成额外上下文

插件作用于所有 Profile 和 Route。某个关注点如果不依赖当前激活的是哪个 Profile，它通常更适合放进插件。

## 一个简单判断标准

可以用下面这个问题判断：

> 如果应用有多个 Profile 和多个 Route，这个行为是否仍然存在？

如果答案是「是」，它更可能属于插件；如果它只服务于某个 Profile 的身份、某条 Route 的行为，应该放到 Profile 或 Route。

## 插件契约

```ts
interface AgentrailPlugin {
  name: string;

  // Process lifecycle
  start?(): Promise<void>;
  stop?(): Promise<void>;

  // Chat interception
  interceptChatRequest?(
    request: AgentrailChatRequest,
    context: AgentrailRequestLifecycleContext,
  ): Promise<AgentrailChatResponse | null>;

  // Request lifecycle
  onRequestStart?(context: AgentrailRequestLifecycleContext): Promise<void>;
  onRequestEnd?(context: AgentrailRequestLifecycleContext): Promise<void>;
  onTurnPersisted?(context: AgentrailRequestLifecycleContext): Promise<void>;

  // Context injection
  contextProviders?: ContextProvider[];

  // Attachment handling
  attachmentHandler?(
    attachments: Attachment[],
    context: AgentrailRequestLifecycleContext,
  ): Promise<string>;
}
```

## 各字段的作用

### `name`

插件的稳定标识。通常用于诊断日志和插件组装。

### `start` / `stop`

进程级生命周期钩子。适合用来初始化和回收插件自有服务：

```ts
{
  name: "activity-tracker",
  async start() {
    await activityDb.connect();
  },
  async stop() {
    await activityDb.disconnect();
  },
}
```

### `interceptChatRequest`

在 Host 将请求交给 Profile 之前运行。如果插件返回响应，正常的 Profile 执行会被直接跳过。

适用场景包括：

- `Slash Command`，例如 `/summarize`、`/reset`
- 仅限管理员的请求处理
- 应在 Agent 执行前直接拦截的预检逻辑

```ts
{
  name: "slash-commands",
  async interceptChatRequest(request, context) {
    if (typeof request.message === "string" && request.message.startsWith("/reset")) {
      await sessionStore.clear(context.sessionId);
      return { sessionId: context.sessionId, message: "Session cleared." };
    }
    return null;
  },
}
```

只要有一个插件返回非 `null` 响应，后续插件就不会继续处理该请求。

### `onRequestStart`

每次 `chat` 或 `stream` 请求开始时触发，早于 profile 解析。适合用于：

- 前台活动标记
- 请求级初始化
- 存活状态记录

### `onRequestEnd`

完整请求生命周期结束后触发。适合用于：

- 请求级状态清理
- 日志记录
- 指标上报

### `onTurnPersisted`

Host 将本轮对话持久化到 `Session Store` 后触发。凡是依赖「会话状态已经落盘」的行为，都更适合放在这里，例如用户记忆索引更新。

### `contextProviders`

插件可以通过 `contextProviders` 提供一组 `ContextProvider`。这些 `Context Provider` 会与 Profile 自身的 `Context Provider` 合并，并在每次请求时执行。

### `attachmentHandler`

当请求带有上传文件时调用。它返回一段会被注入请求上下文的文本。多个插件的附件输出会被拼接在一起。

```ts
{
  name: "attachment-hints",
  async attachmentHandler(attachments) {
    const names = attachments.map((a) => a.filename).join(", ");
    return `Uploaded files: ${names}`;
  },
}
```

## 生命周期上下文

所有请求钩子都会收到一个 `AgentrailRequestLifecycleContext`：

```ts
{
  kind: "chat" | "stream";
  tenantId: string;
  userId: string;
  sessionId: string;
  agentId: string;
}
```

这个上下文刻意保持简洁。插件通常不需要理解完整请求体。

## 执行模型

- 插件按注册顺序组装
- `onRequestStart`、`onRequestEnd`、`onTurnPersisted` 按顺序等待执行
- `interceptChatRequest` 在第一个返回非 `null` 的插件处停止
- `attachmentHandler` 的结果会按顺序拼接
- 所有插件提供的 `contextProviders` 会与 Profile 的 `Context Provider` 合并

## 插件与其他层的边界

| 关注点                   | 应放置的位置                  |
| ------------------------ | ----------------------------- |
| `Slash Command` 处理     | Plugin `interceptChatRequest` |
| 回合结束后的用户记忆更新 | Plugin `onTurnPersisted`      |
| 请求期活动追踪           | Plugin `onRequestStart`       |
| 上传文件的元信息提示     | Plugin `attachmentHandler`    |
| 领域内推理能力           | Tool                          |
| 系统提示词身份           | Profile                       |
| Route 级请求处理         | Route                         |
| 多 Agent 工作流          | Orchestration                 |

## 相关概念

- [Host（英文）](../../concepts/host.md)
- [Profile（英文）](../../concepts/profiles.md)
- [上下文与压缩](./context-and-compaction.md)

## 相关参考

- [Plugin 契约](../reference/plugin-contract.md)
- [编写插件](../guides/write-a-plugin.md)
