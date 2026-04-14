# Inspector Route

这一组只读 HTTP API 供 [Agentrail Inspector](https://github.com/yai-dev/agentrail-inspector) 使用，主要用于浏览 Session、执行 Trace 和多 Agent 编排图。

## 适用时机

当需要回答以下问题时，可先阅读本页：

- 如何启用 Inspector
- 使用文件系统后端和数据库后端时应如何接入
- Inspector 暴露了哪些只读接口

## 启用 Inspector

### 文件系统后端

在 `createAgentApp` 中传入 `inspector: true` 即可。此时必须同时配置 `dataDir`：

```ts
import { createAgentApp } from "@agentrail/app";

const app = createAgentApp({
  dataDir: "./data",
  profiles: [myProfile],
  inspector: true,
});
```

Route 会固定挂载在 `/__inspector`。当前 v1 中，这个挂载路径不能改，因为 Agentrail Inspector 的 Docker 镜像代理前缀已固定写死。

### 自定义数据源

如果使用数据库等非文件系统后端，可把一个实现了 `InspectorDataSource` 的对象传给 `inspector`：

```ts
import { createAgentApp } from "@agentrail/app";
import { PostgresInspectorDataSource, createSqlClient } from "@agentrail/storage-postgres";

const sql = createSqlClient({ connectionString: process.env.DATABASE_URL! });

const app = createAgentApp({
  sessionStore: new PostgresSessionStore(sql),
  profiles: [myProfile],
  inspector: new PostgresInspectorDataSource(sql),
});
```

任何实现了 `InspectorDataSource` 的对象都可以接入，因此也可以为自己的存储后端编写适配器。

### 约束

- `inspector: true` 依赖 `dataDir`，且不能和自定义 `sessionStore` 同时使用。若违反这两个前提，启动时会直接报错。
- 传入显式的 `InspectorDataSource` 时，可以与任意 `sessionStore` 组合使用。

## 运行 Inspector UI

拉取并运行 Inspector Docker 镜像，并让它指向当前 Agentrail 应用：

```bash
docker run -d \
  -p 8080:80 \
  -e AGENTRAIL_URL=http://host.docker.internal:3000 \
  --name inspector \
  ghcr.io/yai-dev/agentrail-inspector:latest
```

然后访问 `http://localhost:8080`。

也可以直接使用 [agentrail-inspector](https://github.com/yai-dev/agentrail-inspector) 仓库中的参考 Docker Compose 文件。

## 接口

以下接口都以 `/__inspector` 为前缀。

### `GET /sessions`

返回所有 Tenant 下的 Session 列表，并附带补充元数据。

返回示例：

```json
{
  "sessions": [
    {
      "tenantId": "default",
      "sessionId": "fdfddf7a-5054-4124-82c5-6b925cb20b78",
      "userId": "user-1",
      "lastActive": "2026-04-09T05:36:13.000Z",
      "turns": 4,
      "tokens": 8000,
      "status": "idle"
    }
  ]
}
```

### `GET /sessions/:sessionId/trace`

返回某个 Session 的合并 Trace，包括 Runtime Events 和编排事件，按时间顺序输出。

查询参数：

| 参数       | 默认值      | 说明                |
| ---------- | ----------- | ------------------- |
| `tenantId` | `"default"` | Session 所属 Tenant |

返回示例：

```json
{
  "envelopes": [
    {
      "id": "uuid",
      "timestamp": "2026-04-09T05:25:53.000Z",
      "sequence": 0,
      "source": "runtime",
      "sessionId": "...",
      "tenantId": "default",
      "traceId": "...",
      "event": { "type": "session.start" }
    }
  ]
}
```

编排事件会追加在 Runtime Events 之后，并延续 Runtime 的 `sequence` 编号，因此客户端只按 `sequence` 排序即可。

### `GET /sessions/:sessionId/orchestration`

返回当前 Session 的编排状态快照，包括被创建过的 Agents、角色、状态与最近任务结果。

查询参数：

| 参数       | 默认值      | 说明                |
| ---------- | ----------- | ------------------- |
| `tenantId` | `"default"` | Session 所属 Tenant |

### `GET /sessions/:sessionId/messages`

返回某个 Session 的原始消息历史。Inspector UI 的 Context Diff 视图会使用它来显示完整的 LLM 对话。

查询参数：

| 参数       | 默认值      | 说明                |
| ---------- | ----------- | ------------------- |
| `tenantId` | `"default"` | Session 所属 Tenant |

### `GET /health`

轻量级健康检查。只要进程存活，就返回 `200`。

## 安全性

Inspector API 不内置认证。它会暴露全部 Session 数据，包括完整消息历史和 Tool 输出。

建议：

- 只部署在私有网络内，或放在带认证的反向代理之后
- 不要直接把 `/__inspector` 暴露到公网

## 手动挂载 Inspector

如果不使用 `createAgentApp`，也可以通过高级 API 手动挂载：

```ts
import { createInspectorRoute, createFilesystemInspectorDataSource } from "@agentrail/app/advanced";
import { Hono } from "hono";

const app = new Hono();

app.route("/__inspector", createInspectorRoute(createFilesystemInspectorDataSource("./data")));
```

如果是自定义后端，则传入自己的 `InspectorDataSource` 实例即可。

## 实现自定义 `InspectorDataSource`

```ts
import type { InspectorDataSource } from "@agentrail/app/advanced";

export class MyInspectorDataSource implements InspectorDataSource {
  async listSessions(): Promise<InspectorSessionItem[]> {
    /* ... */
  }
  async loadTraceEnvelopes(
    tenantId: string,
    sessionId: string,
  ): Promise<WorkflowTraceEventEnvelope[]> {
    /* ... */
  }
  async loadOrchestrationEvents(tenantId: string, sessionId: string): Promise<unknown[]> {
    /* ... */
  }
  async loadOrchestrationState(
    tenantId: string,
    sessionId: string,
  ): Promise<{ snapshot: OrchestrationSnapshot } | null> {
    /* ... */
  }
  async loadMessages(tenantId: string, sessionId: string): Promise<Message[]> {
    /* ... */
  }
}
```

## 相关文档

- [构建存储后端](../guides/build-a-storage-backend.md)
- [Session Store](./session-store.md)
- [英文原文](../../reference/inspector-route.md)
