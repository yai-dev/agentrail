# 上下文与压缩

`ContextProvider` 用于向 Agent 的消息列表注入请求期信息。Transform Context 用于改写请求期历史。Compaction 用于控制 token 预算，当前由三层能力共同完成：工具结果压缩、请求边界上的 Session 压缩，以及 `Agent Loop` 内的响应式压缩。

## Context Provider

`ContextProvider` 是一个异步函数，接收当前请求上下文，并返回一组要插入在 session 历史之前的消息：

```ts
import type { ContextProvider } from "@agentrail/app";

const identityProvider: ContextProvider = async (context) => {
  return [
    {
      role: "user",
      content: `Tenant: ${context.tenantId}\nUser: ${
        context.userId
      }\nDate: ${new Date().toISOString()}`,
      timestamp: Date.now(),
    },
  ];
};
```

`ContextProvider` 返回的消息会被放在历史消息之前，但不会持久化。每次请求都会重新计算。

## Transform Context

`TransformContextFn` 会在模型调用前立即改写历史消息。与 `ContextProvider` 不同，它可以替换、总结或移除已有消息。

常见用途包括：

- 压缩过大的 `toolResult`
- 对持久化历史做脱敏或规范化
- 在 `Context Provider` 注入前组合多个历史改写步骤

## 哪些内容适合放在 Context Provider 中

适合的内容包括：

- 用户身份、租户、日期等头信息
- memory 索引摘要
- knowledge base 摘要
- skills 清单上下文
- workspace 快照

不适合放在 `Context Provider` 中的内容包括：

- 本应写在 `System Prompt` 里的内容
- 本应由工具承担的行为
- 大段原始文档，而不是摘要或索引项

## 上下文处理管线

当请求进入 Host 后，会先按顺序运行 `Transform Contexts`，再基于改写后的历史执行所有 `Context Providers`，最后把 `Context Provider` 生成的消息前置到历史之前。

这条管线可通过 `@agentrail/app/advanced` 中的 `createTransformContext` 构建：

```ts
import { createTransformContext } from "@agentrail/app/advanced";

const transformContext = createTransformContext([
  identityProvider,
  memoryProvider,
  knowledgeProvider,
  workspaceProvider,
]);
```

顺序会直接影响结果。一般来说：

- 身份和日期头信息应最先出现
- memory 与 knowledge 摘要应在历史之前
- workspace 快照应足够靠后，以反映最新状态

若存在多个改写函数，可使用 `composeTransformContexts(...)` 按从左到右的顺序串联，然后再执行 `Context Provider` 注入。

## 默认层

若采用推荐的高层接入路径，可使用 `memoryContext(...)`。若需要更细的组装方式，可使用：

- `createDefaultCapabilityContextProviders(...)`
- `createDefaultCapabilityTransformContext(...)`

```ts
import {
  createDefaultCapabilityContextProviders,
  createDefaultCapabilityTransformContext,
} from "@agentrail/capabilities";

const providers = createDefaultCapabilityContextProviders(options);
const transform = createDefaultCapabilityTransformContext(options);
```

这组默认实现覆盖了常见的 `Context Provider` 组合：memory 摘要、knowledge 摘要、skills 索引和 workspace 快照，并按推荐顺序注入。当前 `memoryContext(...)` capability 也同时提供 `Context Provider` 与 `Transform Context`，因此它既能补充上下文，也能在 `Context Provider` 运行前对历史做压缩。

## 上下文窗口预算

底层 `Profile` 契约支持 `contextWindow` 字段，用于声明模型单次调用可承受的最大 token 数。Host 会使用这个值来：

- 通过 `loadMessagesWithBudget` 裁剪 Session 历史，只保留最近且仍能放入窗口的消息
- 在 SSE 事件中计算 `budgetUsedPct`，让客户端显示上下文预算占用

如果在自定义底层 profile 时没有明确设置，host 默认使用 `200_000`。若直接实现 `AgentrailProfile`，应尽量准确填写，以保证客户端看到的预算百分比可信。

## Compaction

当前 Agentrail 使用三层 compaction：

- `compactToolResults(...)`：改写过大的 `toolResult`，并可将原始文本持久化到 `tool-results/{toolCallId}.txt`
- 请求边界压缩：在请求开始时总结过旧历史，并把移除的消息归档到 `messages.compactions/*.jsonl`
- Agent Loop 内响应式压缩：在长回合运行中、下一次模型调用可能超出窗口之前，对旧 API 轮次做总结

### 请求边界压缩

Host 会在每次请求开始时对 `Session Store` 调用 `compactIfNeeded`。当累计历史超过 `triggerTokens` 时，会执行：

1. 读取完整 session 历史
2. 调用 `summarize` 函数总结旧消息
3. 用一条摘要消息替换旧消息
4. 持久化压缩后的历史

从 agent 视角看，这条摘要消息会作为会话历史的一部分出现。后续请求会直接加载摘要，而不是旧的原始消息。

### 响应式压缩

响应式压缩运行在 `agentLoop` 内，依据 `Profile` 的 `contextWindow` 与上一轮真实 prompt 使用量触发。当前包含两种策略：

- `micro`：只总结最旧的少量 API 轮次，同时保留当前用户请求和最近工作集
- `full`：总结整个可压缩前缀，通常用于 prompt 使用量非常高或已经收到 prompt-too-long 错误之后

这一条路径在 Runtime 或 Stream 中暴露为 `compaction` 事件；而 Host 侧的 SSE 事件 `context_compaction_start` 和 `context_compaction_end` 只用于请求边界压缩。

### 配置方式

可在 `createAgentApp` 中传入 `summarize` 和 `compaction`：

```ts
import type { Message } from "@agentrail/core";
import { createAgentApp } from "@agentrail/app";

const summarize = async (messages: Message[]) =>
  messages.map((m) => `${m.role}: ${JSON.stringify(m.content)}`).join("\n");

const app = createAgentApp({
  dataDir: DATA_DIR,
  profiles: [defaultProfile],
  summarize,
  compaction: {
    triggerTokens: 80_000,
    minMessages: 20,
    reactive: {
      microTriggerPct: 85,
      fullTriggerPct: 92,
      preserveRecentApiRounds: 2,
      microBatchGroups: 2,
      maxReactiveCompactionsPerRequest: 3,
    },
  },
});
```

### `summarize` 函数

`summarize` 会接收旧消息以及一个可选原因，并返回简洁摘要文本。生产环境中通常会通过一个小而快的 LLM 来完成：

```ts
const summarize = async (
  messages: Message[],
  ctx?: { reason: "session_compaction" | "reactive_micro" | "reactive_full" },
) => {
  const response = await llm.complete({
    system: `Summarize the following conversation history concisely. Reason: ${
      ctx?.reason ?? "session_compaction"
    }`,
    messages,
  });
  return response.text;
};
```

### compaction 事件

当请求边界压缩运行时，`Stream Route` 会通过 SSE 发出 `context_compaction_start` 和 `context_compaction_end`。当 `Agent Loop` 内的响应式压缩运行时，Runtime 会发出 `compaction` 事件，并带上 `messagesBefore` 与 `messagesAfter`。

## 相关概念

- [Session（英文）](../../concepts/sessions.md)
- [Host（英文）](../../concepts/host.md)
- [Profile（英文）](../../concepts/profiles.md)
- [插件](./plugins.md)

## 相关参考

- [Session Store](../reference/session-store.md)
- [添加上下文](../guides/add-context.md)
