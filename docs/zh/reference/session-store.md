# Session Store

Host 层依赖的是 `AgentrailSessionStore` 契约，而不是某个具体存储实现。

## 适用时机

当出现以下需求时，可先阅读本页：

- 希望替换默认的文件系统 Session Manager
- 想明确 Host 对存储层的最小要求
- 正在为自定义 Host 设计持久化边界

## 职责范围

`AgentrailSessionStore` 负责以下事情：

- 创建或恢复 Session
- 读取消息历史
- 追加消息
- 记录用量
- 在需要时压缩历史
- 可选地读写 Memo 文档，例如 `NOTES.md`、`TODO.md`、`USER.md`
- 可选地读写 Tool Result Artifacts

默认实现是 `@agentrail/app` 提供的文件系统版 `SessionManager`。如果需要 PostgreSQL，可直接使用 `@agentrail/storage-postgres`。

## 接口

完整的 `AgentrailSessionStore` 契约定义在 `@agentrail/core` 中。

### `getOrCreate`（必需）

```ts
getOrCreate(
  tenantId: string,
  userId: string,
  agentId: string,
  sessionId?: string,
): Promise<{ sessionId: string }>
```

返回已有 Session，或创建一个新 Session。若未传入 `sessionId`，则会生成新的 UUID。

### `loadMessages`（必需）

```ts
loadMessages(tenantId: string, sessionId: string, limit?: number): Promise<Message[]>
```

返回最近的 `limit` 条消息。未传入 `limit` 时，应返回一个合理的近期窗口。

### `loadMessagesWithBudget`（必需）

```ts
loadMessagesWithBudget(
  tenantId: string,
  sessionId: string,
  tokenBudget?: number,
): Promise<Message[]>
```

在给定 Token Budget 下，尽可能返回最近且能放入窗口的消息。`chat` 与 `stream` 两条 Route 都会使用它来控制上下文长度。

### `loadAllMessages`（必需）

```ts
loadAllMessages(tenantId: string, sessionId: string): Promise<Message[]>
```

返回当前 Session 的完整历史消息。Compaction 系统会用它来判断是否需要总结旧回合。

### `appendMessages`（必需）

```ts
appendMessages(tenantId: string, sessionId: string, messages: Message[]): Promise<void>
```

在一个回合完成后，把新消息写入 Session Store。

### `recordTurn`（必需）

```ts
recordTurn(tenantId: string, sessionId: string, usage: Usage): Promise<void>
```

记录当前回合的 Token 用量，通常用于计费或观测。

### `compactIfNeeded`（必需）

```ts
compactIfNeeded(
  tenantId: string,
  sessionId: string,
  summarizeFn: (messages: Message[]) => Promise<string>,
  options?: {
    triggerTokens?: number;
    compactFraction?: number;
    preloadedMessages?: Message[];
    workspaceSnapshot?: string;
  },
): Promise<boolean>
```

当累计历史超过 `triggerTokens` 时执行 Compaction。它会调用 `summarizeFn` 把旧消息压成摘要消息，并把压缩后的历史重新持久化。若实际执行了 Compaction，则返回 `true`。

### `readMemoryDocument`（可选）

```ts
readMemoryDocument?(
  tenantId: string,
  ownerId: string,
  scope: "session" | "user",
  name: "NOTES.md" | "TODO.md" | "USER.md",
): Promise<string | null>
```

读取 Session 或 User 级的 Memo 文档。它会被 User Memory Consolidation Service，以及向上下文注入 Memory 的 `Context Provider` 调用。

如果使用非文件系统 Store，并且启用了 `UserMemoryConsolidationService`，则这一方法实际上是必需的。

### `writeMemoryDocument`（可选）

```ts
writeMemoryDocument?(
  tenantId: string,
  ownerId: string,
  scope: "session" | "user",
  name: "NOTES.md" | "TODO.md" | "USER.md",
  content: string,
): Promise<void>
```

写入 Memo 文档，是 `readMemoryDocument` 的写侧对应方法。

### `appendMemoryDocument`（可选）

```ts
appendMemoryDocument?(
  tenantId: string,
  ownerId: string,
  scope: "session" | "user",
  name: "NOTES.md" | "TODO.md" | "USER.md",
  content: string,
): Promise<void>
```

向已有 Memo 文档追加内容。`write_notes`、`write_todo` 这类 In-Context Memo Tools 会用到它。

### `readToolResultArtifact`（可选）

```ts
readToolResultArtifact?(
  sessionRef: SessionRef,
  toolCallId: string,
): Promise<string | null>
```

读取被压缩后单独保存的 Tool Result Artifact。历史重建时，如果某个 Tool Result 被拆出去单独存储，就会调用它。

### `writeToolResultArtifact`（可选）

```ts
writeToolResultArtifact?(
  sessionRef: SessionRef,
  toolCallId: string,
  content: string,
): Promise<void>
```

写入 Tool Result Artifact。当 Tool 输出过大，不适合内联存储时，`compactToolResults` 会调用它。

### `listToolResultArtifactIds`（可选）

```ts
listToolResultArtifactIds?(sessionRef: SessionRef): Promise<string[]>
```

返回当前 Session 中所有已保存 Tool Result Artifact 的 `toolCallId`。`SandboxManager` 会在 Sandbox 创建时调用它，用来预先填充容器内部的 `/workspace/memo/session/tool-results/` 目录。

如果未实现，Sandbox 内对应目录会从空目录开始，即便外部存储里实际上已有 Artifact。

## 实现自定义 Store

自定义 Store 至少要实现所有必需方法。可选方法可以按需逐步补齐，以解锁 Memo 文档、Tool Result Compaction 等功能。

### 最小内存版示例

```ts
import { randomUUID } from "node:crypto";
import type { Message, SessionRef, Usage } from "@agentrail/core";
import type { AgentrailSessionStore } from "@agentrail/app";

interface SessionRecord {
  sessionId: string;
  messages: Message[];
  usageHistory: Usage[];
}

export class InMemorySessionStore implements AgentrailSessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  async getOrCreate(
    _tenantId: string,
    _userId: string,
    _agentId: string,
    sessionId?: string,
  ): Promise<{ sessionId: string }> {
    const id = sessionId ?? randomUUID();
    if (!this.sessions.has(id)) {
      this.sessions.set(id, { sessionId: id, messages: [], usageHistory: [] });
    }
    return { sessionId: id };
  }
}
```

将自定义 Store 接入 `createAgentApp`：

```ts
import { createAgentApp } from "@agentrail/app";
import { InMemorySessionStore } from "./in-memory-session-store.js";

const app = createAgentApp({
  sessionStore: new InMemorySessionStore(),
  profiles: [defaultProfile],
});
```

### 生产数据库实现

在生产环境中，可把内存 `Map` 替换成数据库查询，把 `loadMessages`、`appendMessages` 与 `compactIfNeeded` 分别映射到具体 SQL 或存储操作。

仓库内已经提供了完整的 PostgreSQL 实现：

```ts
import { PostgresSessionStore, createSqlClient } from "@agentrail/storage-postgres";

const sql = createSqlClient({ connectionString: process.env.DATABASE_URL! });

const app = createAgentApp({
  sessionStore: new PostgresSessionStore(sql),
  traceStoreFactory: (sessionRef) => new PostgresSessionTraceStore(sql, sessionRef),
  inspector: new PostgresInspectorDataSource(sql),
  profiles: [defaultProfile],
});
```

`PostgresSessionStore` 已实现所有必需方法，以及 Memo 文档和 Tool Result Artifacts 的可选方法，因此 Host 相关功能可以直接使用。

## 说明

本页覆盖了 Session Store 的主要职责、必需方法、可选方法，以及自定义实现的最小范围。若需要逐项对照完整英文内容，可继续阅读 [英文原文](../../reference/session-store.md)。

## 相关文档

- [配置 Session](../guides/configure-sessions.md)
- [构建存储后端](../guides/build-a-storage-backend.md)
- [部署](../guides/deployment.md)
