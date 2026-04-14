# 消费流式响应

> 推荐方式：优先使用 `@agentrail/app` 中的 `createAgentApp` 挂载 `/stream`。只有在需要直接控制 Route 挂载时，再使用底层的 `createStreamRoute`。

`createAgentApp` 以及底层的 `createStreamRoute` 都会返回一个流式 HTTP 响应，响应体采用按行分隔的 JSON 格式。本页说明如何在浏览器或 Node.js 服务中消费这条流。

## 适用时机

建议在读完以下内容后阅读本页：

- [快速开始](./quickstart.md)
- [Events（英文）](../../concepts/events.md)

## 流是如何工作的

当向流式接口发起 `POST` 请求时：

1. 服务端会立即开始执行 Agent，并开始输出流
2. 响应体由多行 JSON 组成，每行对应一个事件
3. 响应头 `X-Session-Id` 会返回当前 Session ID，供后续请求继续使用
4. 在 `session.end` 以及最后的 Host Events 发送完成后，连接关闭

响应体中的每一行都是 `@agentrail/app` 中 `AgentrailEvent` 的序列化结果。具体事件类型由 `type` 字段决定。

## 请求格式

```ts
POST /api/stream
Content-Type: application/json

{
  "message": "Hello, how can you help me?",
  "agentId": "default",
  "sessionId": "session-uuid",
  "tenantId": "tenant-1",
  "userId": "user-1"
}
```

`agentId`、`sessionId`、`tenantId`、`userId` 都是可选的。未传 `sessionId` 时，服务端会创建新的 Session。

## 最小浏览器示例

```ts
async function chat(message: string, sessionId?: string) {
  const response = await fetch("/api/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const nextSessionId = response.headers.get("X-Session-Id") ?? sessionId;

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      handleEvent(event);
    }
  }

  return nextSessionId;
}
```

## 常见事件类型

下表列出构建流式 UI 时最常处理的几类事件：

| 事件类型                   | 时机                      | 关键字段                                       |
| -------------------------- | ------------------------- | ---------------------------------------------- |
| `message.start`            | LLM 开始生成              | —                                              |
| `message.update`           | LLM 返回文本增量          | `delta`                                        |
| `message.end`              | LLM 生成结束              | —                                              |
| `tool.before`              | Agent 开始调用 Tool       | `toolName`、`toolCallId`                       |
| `tool.after`               | Tool 调用完成             | `toolCallId`、`result`                         |
| `context_compaction_start` | 历史压缩开始              | —                                              |
| `context_compaction_end`   | 历史压缩结束              | —                                              |
| `context_usage`            | 回合结束后的 Token Budget | `inputTokens`、`outputTokens`、`budgetUsedPct` |
| `session.end`              | Agent Loop 完成           | `messages`、`usage`                            |
| `error`                    | 不可恢复错误              | `error.message`                                |

## 示例事件处理器

```ts
import type { AgentrailEvent } from "@agentrail/app";

function handleEvent(event: AgentrailEvent) {
  switch (event.type) {
    case "message.update":
      appendText(event.delta ?? "");
      break;

    case "tool.before":
      showToolIndicator(event.toolName, "running");
      break;

    case "tool.after":
      showToolIndicator(event.toolCallId, "done");
      break;

    case "context_compaction_start":
      showCompactionBadge(true);
      break;

    case "context_compaction_end":
      showCompactionBadge(false);
      break;

    case "context_usage":
      updateBudgetBar(event.budgetUsedPct ?? 0);
      break;

    case "session.end":
      console.log("Total tokens:", event.usage?.totalTokens);
      break;

    case "error":
      showError(event.error.message);
      break;
  }
}
```

## Session 连续性

流式接口会通过 `X-Session-Id` 响应头返回当前 Session ID。应在客户端保存这个值，并在下一次请求中继续传回：

```ts
let currentSessionId: string | undefined;

async function sendMessage(text: string) {
  const nextSessionId = await chat(text, currentSessionId);
  currentSessionId = nextSessionId;
}
```

首次请求时省略 `sessionId`；之后始终带上已保存的 `sessionId`，即可在同一会话中继续对话。

## Node.js 或服务端消费

如果需要从另一个 Node.js 服务消费这条流，例如在 BFF 层中转：

```ts
import { Readable } from "node:stream";

async function streamFromServer(message: string, sessionId?: string) {
  const response = await fetch("http://agent-server/api/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId }),
  });

  const nextSessionId = response.headers.get("X-Session-Id");
  const events: AgentrailEvent[] = [];

  const readable = Readable.fromWeb(response.body as ReadableStream);
  let buffer = "";

  for await (const chunk of readable) {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) events.push(JSON.parse(line));
    }
  }

  return { events, nextSessionId };
}
```

## 编排事件

如果服务端启用了多 Agent 编排，流中还会包含额外事件：

| 事件类型                     | 含义                   |
| ---------------------------- | ---------------------- |
| `orchestration_run_start`    | 多 Agent 运行开始      |
| `subagent_spawned`           | 创建了一个 Sub-Agent   |
| `subagent_status`            | Sub-Agent 状态变化     |
| `subagent_job_started`       | Sub-Agent 开始处理任务 |
| `subagent_job_completed`     | Sub-Agent 完成任务     |
| `subagent_closed`            | Sub-Agent 已关闭       |
| `orchestration_run_complete` | 多 Agent 运行结束      |

这类事件特别适合用来构建编排进度视图或调试面板。

## TypeScript 类型

可以直接从 `@agentrail/app` 导入完整事件联合类型：

```ts
import type { AgentrailEvent, AgentrailHostEvent } from "@agentrail/app";
```

`AgentrailEvent` 已覆盖 Runtime Events、Skill Events 与 Host Events，适合作为通用事件消费者的类型。

## 相关概念

- [Events（英文）](../../concepts/events.md)
- [Host（英文）](../../concepts/host.md)
- [Orchestration（英文）](../../concepts/orchestration.md)

## 相关参考

- [事件](../reference/events.md)
- [Host 原语](../reference/host-primitives.md)
