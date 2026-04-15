# Telemetry Sink

这是一个可插拔接口，用于接收 `/chat` 与 `/stream` Route 发出的结构化事件，并把它们转发到外部观测系统，例如 OpenTelemetry、Datadog 或自定义后端。

## 启用方式

通过 `createAgentApp` 传入一个 `TelemetrySink`：

```ts
import { createAgentApp, createFileTelemetrySink } from "@agentrail/app";

const app = createAgentApp({
  dataDir: "./data",
  profiles: [myProfile],
  telemetrySink: createFileTelemetrySink("./data"),
});
```

## `TelemetrySink` 接口

```ts
interface TelemetrySink {
  emit(event: TelemetrySinkEvent): void | Promise<void>;
  flush?(): Promise<void>;
}
```

### `emit(event)`

对每个 Telemetry Event 调用一次。可以是异步函数。即便 `emit` 抛错，框架也会吞掉异常，不会让请求链路失败。

### `flush()`

可选方法。框架会在每次 HTTP 请求结束时调用它，用于把内存缓冲中的数据刷到外部系统。

需要注意的是，进程关闭时的 `flush` 并不由框架自动处理。Host 应用需要在自己的关闭流程中显式调用：

```ts
process.once("SIGTERM", async () => {
  await telemetrySink.flush?.();
  process.exit(0);
});
```

## `TelemetrySinkEvent`

```ts
interface TelemetrySinkEvent {
  traceId: string;
  sessionId: string;
  tenantId: string;
  timestamp: string;
  sequence: number;
  source: "runtime" | "orchestration" | "host";
  event: Record<string, unknown>;
}
```

| 字段        | 说明                       |
| ----------- | -------------------------- |
| `traceId`   | 当前请求链的唯一标识       |
| `sessionId` | 事件所属 Session           |
| `tenantId`  | 事件所属 Tenant            |
| `timestamp` | ISO-8601 时间戳            |
| `sequence`  | 单个请求内部单调递增的序号 |
| `source`    | 事件来源                   |
| `event`     | 原始事件载荷               |

### 事件来源

| 来源              | 说明                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `"runtime"`       | Agent Loop 事件，例如回合开始、结束、Tool 调用、Compaction、错误 |
| `"orchestration"` | 多 Agent 协调事件，例如 Agent 创建、任务分发、Agent 关闭         |
| `"host"`          | `/chat` 与 `/stream` Route 发出的 Host 级事件                    |

## 内建 Sink

### `createConsoleTelemetrySink()`

把每个事件格式化输出到标准输出。适合本地开发，不建议直接用于生产环境。

### `createFileTelemetrySink(dataDir)`

把事件按 JSONL 追加写入 `dataDir` 下的 Trace 文件。它与 `SessionManager` 使用相同的目录布局，因此 Agentrail Inspector 可以直接读取。

## 自定义 Sink

只要实现 `TelemetrySink` 接口，就可以接入任意外部观测系统：

```ts
import type { TelemetrySink, TelemetrySinkEvent } from "@agentrail/app";

function createOpenTelemetrySink(): TelemetrySink {
  return {
    async emit(event: TelemetrySinkEvent): Promise<void> {
      const span = tracer.startSpan(String(event.event["type"] ?? "unknown"), {
        attributes: {
          "agentrail.session_id": event.sessionId,
          "agentrail.tenant_id": event.tenantId,
          "agentrail.trace_id": event.traceId,
          "agentrail.source": event.source,
        },
      });
      span.end();
    },
    async flush(): Promise<void> {
      await provider.forceFlush();
    },
  };
}
```

## 不同 Route 的事件粒度

`/chat` 与 `/stream` 发出的事件粒度并不相同：

| Route     | 事件粒度                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/stream` | 完整粒度，包括 `session.start`、`turn.start`、`tool.before`、`tool.after`、`turn.end`、`session.end` 以及 Compaction Events |
| `/chat`   | 只发较粗粒度的合成事件，例如 `agent_start`、`agent_end`、`error`                                                            |

如果需要完整的观测 Trace，应优先使用 `/stream`。

## 相关文档

- [Inspector Route](./inspector-route.md)
- [消费流式响应](../guides/consume-stream.md)
- [英文原文](../../reference/telemetry-sink.md)
