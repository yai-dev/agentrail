# 事件

Agentrail Host 会发出一组统一的类型化事件流，供 UI 集成、观测和 Trace 持久化使用。

## 适用时机

当需要处理以下问题时，可先阅读本页：

- 构建流式 UI 或 Trace 面板
- 在客户端处理特定事件类型
- 判断哪些事件会写入 Trace Log
- 在面板中展示多 Agent 编排进度

## 类型层级

核心事件联合类型如下：

```ts
import type { AgentrailEvent, AgentrailHostEvent } from "@agentrail/app";
import type { RuntimeEvent } from "@agentrail/core";

type AgentrailEvent = RuntimeEvent | ExtendedSseEvent | AgentrailHostEvent;
```

对大多数 UI 消费方而言，直接把解析后的 SSE Payload 标注为 `AgentrailEvent` 即可。

## Host Events

以下事件由 Host 层产生，而不是 Runtime 本身：

### `context_compaction_start`

当 Host 开始对旧 Session 历史做 Compaction 时发出。

### `context_compaction_end`

当 Compaction 完成，且摘要结果已经持久化后发出。

### `context_usage`

```ts
interface AgentrailContextUsageEvent {
  type: "context_usage";
  inputTokens: number;
  outputTokens: number;
  budgetUsedPct?: number;
}
```

每个回合结束后发出，用于报告 Token 使用量。若 Profile 配置了 `contextWindow`，则会带上 `budgetUsedPct`。

### `error`

当流式过程中出现 Host 无法恢复的错误时发出。

## 编排映射事件

这组事件由 `mapOrchestrationEvent` 把内部编排状态转换而来，用于让 UI 跟踪 Sub-Agent 进度，而不需要理解底层编排 Schema。

| 事件类型                     | 触发时机                      |
| ---------------------------- | ----------------------------- |
| `orchestration_run_start`    | 一次新的编排运行开始          |
| `orchestration_run_complete` | 当前运行结束                  |
| `subagent_spawned`           | 创建了新的 Sub-Agent          |
| `subagent_status`            | Sub-Agent 状态变化            |
| `subagent_job_started`       | Sub-Agent 开始处理任务        |
| `subagent_job_completed`     | Sub-Agent 成功完成任务        |
| `subagent_job_failed`        | Sub-Agent 任务失败            |
| `subagent_message`           | 向 Sub-Agent 邮箱写入一条消息 |
| `wait_registered`            | 注册了一个 `WaitCondition`    |
| `wait_resolved`              | 某个 `WaitCondition` 已满足   |
| `subagent_closed`            | Sub-Agent 已关闭              |

## Runtime Events 概览

Runtime Events 来自 `@agentrail/core`，在 Agent 执行过程中发出。事件名遵循点分命名形式，例如 `session.*`、`turn.*`、`message.*`、`tool.*`。

对 UI 来说最常见的类型如下：

| 事件类型                    | 含义                                 |
| --------------------------- | ------------------------------------ |
| `session.start`             | Agent 开始处理请求                   |
| `session.end`               | Agent 完成全部处理                   |
| `turn.start`                | 一个新的 LLM 回合开始                |
| `turn.complete`             | 当前回合结束                         |
| `compaction`                | Runtime 内部的响应式 Compaction 发生 |
| `message.update`            | LLM 返回文本增量                     |
| `tool.before`               | Tool 即将执行                        |
| `tool.after`                | Tool 已完成                          |
| `waiting_for_user_input`    | Agent 正在等待用户输入               |
| `permission_request`        | Tool 权限为 `"ask"`，等待 Host 审批  |
| `skill_start` / `skill_end` | Skill Sub-Agent 开始或结束           |

### RuntimeEvent 的追踪字段

每个 `RuntimeEvent` 都会带上以下追踪字段：

```ts
interface RuntimeTracingFields {
  readonly chainId: string;
  readonly depth: number;
  readonly turnIndex: number;
}
```

这些字段用于在多 Agent 场景下把整条请求链上的事件串起来：

- `chainId`：整条请求链共享的相关 ID
- `depth`：当前 Agent 的嵌套深度，根 Agent 为 `0`
- `turnIndex`：当前 Agent 内部的回合编号

### `tool.before` 字段

`tool.before` 里最容易混淆的是 `args` 与 `rawArgs`：

- `args`：真正执行时使用的参数，若有 Plugin 改写，看到的是改写后的值
- `rawArgs`：模型原始生成的参数，适合审计和调试

如果之前把 `args` 当作模型原始输出使用，现在应改为读取 `rawArgs`。

### `permission_request`

当某个 Tool 的 `checkPermissions` 返回 `"ask"` 时，会发出如下事件：

```ts
{
  type: "permission_request";
  toolCallId: string;
  toolName: string;
  reason?: string;
}
```

这个事件会被写入 Trace Log，便于审计哪些 Tool 调用需要人工批准。

## Trace 持久化

并不是所有事件都会进入 Trace Log。高频流式事件，例如 `message.update`、`message.start`、`message.end`，会被有意排除，以避免日志膨胀。

由 `TRACE_PERSISTED_EVENT_TYPES` 决定哪些事件会持久化。当前大体包括：

- 关键 Runtime / Skill Events，例如 `session.start`、`session.end`、`turn.start`、`turn.complete`、`compaction`、`tool.before`、`tool.after`
- Host Events，例如 `context_compaction_start`、`context_compaction_end`、`error`
- 全部编排映射事件

需要区分两类 Compaction：

- `context_compaction_start` / `context_compaction_end`：请求边界上的持久化 Compaction
- `compaction`：Runtime 内部的响应式 Compaction，不会改写 `messages.jsonl`

## 消费事件

### 浏览器

可通过 `fetch` 与 `ReadableStream` 按行读取：

```ts
import type { AgentrailEvent } from "@agentrail/app";

async function streamChat(message: string, sessionId?: string) {
  const response = await fetch("/api/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      tenantId: "default",
      userId: "user-1",
      sessionId,
    }),
  });

  const newSessionId = response.headers.get("X-Session-Id");
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;

      const event = JSON.parse(raw) as AgentrailEvent;
      handleEvent(event);
    }
  }

  return newSessionId;
}
```

### Node.js 服务端

Node.js 服务端消费方式与浏览器类似，核心仍是按行拆分响应体，再逐行解析 JSON。

## `WorkflowTraceEventEnvelope`

`/stream` Route 可以通过 `onTraceEvent` 回调，把可追踪事件包装成结构化 Envelope 持久化：

```ts
interface WorkflowTraceEventEnvelope {
  id: string;
  timestamp: string;
  sequence: number;
  source: "runtime" | "orchestration";
  event: Record<string, unknown>;
}
```

playground server 就是用这种方式把 Trace Log 与 Session 历史一起存储的。

## 设计意图

事件层的设计目标有四点：

- 可组合：只消费真正关心的事件
- 便于流式处理：按行分隔的 JSON 易于在任意语言中解析
- 便于 UI 使用：编排事件已做过映射，不必直接理解底层 Schema
- 只追加：事件表示观测结果，而不是可变状态

事件层并不替代以下内容：

- 持久化的 Session 历史
- Workflow State Store
- 业务侧自己的应用状态

## 相关文档

- [消费流式响应](../guides/consume-stream.md)
- [Host 原语](./host-primitives.md)
- [Playground Server 示例（英文）](../../examples/playground-server.md)
- [英文原文](../../reference/events.md)
