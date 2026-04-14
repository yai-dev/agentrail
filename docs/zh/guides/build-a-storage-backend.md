# 构建存储后端

本页说明一个自定义存储后端需要实现哪些接口，才能在 Agentrail Host 中完整替代默认的文件系统层。

## 适用时机

当需要在 Agentrail 中使用本地文件系统以外的存储后端时，可先阅读本页，例如 PostgreSQL、MySQL、SQLite、Redis 或托管对象存储。

内建的 `@agentrail/storage-postgres` 已实现下文涉及的大多数契约，也可作为参考实现。

## 前置阅读

- [配置 Session](./configure-sessions.md)
- [Session Store](../reference/session-store.md)
- [Inspector Route](../reference/inspector-route.md)

## 契约概览

一个完整的自定义后端通常会涉及 6 组契约；当 Sandbox 启用时，还要处理与镜像刷新相关的职责。

| 契约                       | 作用                                         | 所属包                               |
| -------------------------- | -------------------------------------------- | ------------------------------------ |
| `AgentrailSessionStore`    | 所有请求都依赖的消息、Compaction 与回合记录  | `@agentrail/core` / `@agentrail/app` |
| `UserSessionLister`        | User Memory Consolidation Background Service | `@agentrail/app`                     |
| `SessionTraceStore`        | Workflow Trace 持久化与 Inspector 时间线     | `@agentrail/app`                     |
| `OrchestrationPersistence` | 多 Agent 编排状态                            | `@agentrail/capabilities`            |
| `InspectorDataSource`      | Agentrail Inspector 只读 API                 | `@agentrail/app`                     |
| `SandboxMemoProvider`      | 容器内部的 `/workspace/memo/**`              | `@agentrail/capabilities`            |

并不是每个部署都需要实现全部契约，但如果希望完全替代默认文件系统层，以上接口都需要评估。

## 1. `AgentrailSessionStore`

这是每次请求都会触达的核心契约。7 个方法是必需的；Memo 与 Artifact 相关方法是可选的，但它们会直接影响 Memory Tools 与 Sandbox 的可用性。

### 必需方法

```ts
import type { AgentrailSessionStore } from "@agentrail/app";
import type { Message, SessionRef, Usage } from "@agentrail/core";

export class MySessionStore implements AgentrailSessionStore {
  async getOrCreate(tenantId, userId, agentId, sessionId?) {
    const id = sessionId ?? crypto.randomUUID();
    await db.sessions.upsert({ id, tenantId, userId, agentId });
    return { sessionId: id };
  }

  async loadMessages(tenantId, sessionId, limit?) {
    return db.messages.findMany({ sessionId, limit });
  }

  async loadMessagesWithBudget(tenantId, sessionId, tokenBudget = 100_000) {
    const all = await db.messages.findAll({ sessionId, orderBy: "asc" });
    return trimToTokenBudget(all, tokenBudget);
  }

  async loadAllMessages(tenantId, sessionId) {
    return db.messages.findAll({ sessionId });
  }

  async appendMessages(tenantId, sessionId, messages: Message[]) {
    await db.messages.insertMany(messages.map((m) => ({ ...m, sessionId })));
  }

  async recordTurn(tenantId, sessionId, usage: Usage) {
    await db.usage.insert({ sessionId, ...usage });
  }

  async compactIfNeeded(tenantId, sessionId, summarizeFn, options?) {
    const messages = await this.loadAllMessages(tenantId, sessionId);
    const triggerTokens = options?.triggerTokens ?? 80_000;
    if (estimateTokens(messages) < triggerTokens) return false;

    const compactFraction = options?.compactFraction ?? 0.5;
    const cutoff = Math.floor(messages.length * compactFraction);
    const summary = await summarizeFn(messages.slice(0, cutoff));

    const compacted: Message[] = [
      { role: "user", content: `[Conversation summary]: ${summary}` },
      ...messages.slice(cutoff),
    ];
    await db.messages.replaceAll(sessionId, compacted);
    return true;
  }
}
```

### 可选的 Memo 方法

如果要启用 `write_notes`、`write_todo` 等工具，以及容器内完整的 `/workspace/memo/**` 访问，就需要补上这些方法：

```ts
async readMemoryDocument(tenantId, ownerId, scope, name) {
  return db.memoDocuments.findOne({ tenantId, ownerId, scope, name }) ?? null;
}

async writeMemoryDocument(tenantId, ownerId, scope, name, content) {
  await db.memoDocuments.upsert({ tenantId, ownerId, scope, name, content });
}

async appendMemoryDocument(tenantId, ownerId, scope, name, content) {
  const existing = (await this.readMemoryDocument(tenantId, ownerId, scope, name)) ?? "";
  await this.writeMemoryDocument(tenantId, ownerId, scope, name, existing + content);
}
```

### 可选的 Tool Result Artifact 方法

如果要在 Tool Result 被压缩后仍能在 Sandbox 中读取这些输出，还需要补上以下方法：

```ts
async readToolResultArtifact(sessionRef, toolCallId) {
  return db.toolResultArtifacts.findOne({ sessionRef, toolCallId }) ?? null;
}

async writeToolResultArtifact(sessionRef, toolCallId, content) {
  await db.toolResultArtifacts.upsert({ sessionRef, toolCallId, content });
}

async listToolResultArtifactIds(sessionRef) {
  return db.toolResultArtifacts.findIds({ sessionRef });
}
```

## 2. `UserSessionLister`

User Memory Consolidation Background Service 会通过这个接口扫描某个用户的 Session，以判断是否需要重建 `USER.md`。

```ts
import type { UserSessionLister } from "@agentrail/app";
import type { SessionMeta } from "@agentrail/core";

export class MySessionStore implements AgentrailSessionStore, UserSessionLister {
  async listSessionsByUser(tenantId, userId): Promise<SessionMeta[]> {
    return db.sessions.findMany({
      tenantId,
      userId,
      select: ["sessionId", "updatedAt"],
    });
  }
}
```

如果使用自定义 Store，通常会让同一个实例同时实现 `AgentrailSessionStore` 与 `UserSessionLister`。

## 3. `SessionTraceStore`

这个接口用于持久化 Workflow Trace Events，供 Agentrail Inspector 的时间线回放使用。

```ts
export interface SessionTraceStore<TEnvelope = Record<string, unknown>> {
  appendEnvelope(envelope: TEnvelope): Promise<void>;
  loadEnvelopes(): Promise<TEnvelope[]>;
}
```

可通过工厂函数接入 `createAgentApp`：

```ts
function createDbSessionTraceStore(sessionRef: SessionRef) {
  return {
    async appendEnvelope(envelope) {
      await db.traceEvents.insert({ sessionRef, ...envelope });
    },
    async loadEnvelopes() {
      return db.traceEvents.findAll({ sessionRef, orderBy: "sequence" });
    },
  };
}
```

## 4. `OrchestrationPersistence`

多 Agent 编排需要一个按 Session 隔离的持久层，用于保存 Agent 状态、邮箱事件和崩溃恢复所需信息。

```ts
import type { OrchestrationPersistence } from "@agentrail/capabilities";

function createDbOrchestrationPersistence(sessionRef: SessionRef): OrchestrationPersistence {
  return {
    async appendEvent(event) {
      await db.orchEvents.insert({ sessionRef, ...event });
    },
    async loadEvents() {
      return db.orchEvents.findAll({ sessionRef, orderBy: "sequence" });
    },
    async loadSnapshot() {
      return db.orchSnapshots.findLatest({ sessionRef }) ?? null;
    },
    async writeCheckpoint(snapshot) {
      await db.orchSnapshots.upsert({ sessionRef, snapshot });
    },
  };
}
```

## 5. `InspectorDataSource`

`createInspectorRoute` 通过这个接口读取 Session 数据。它是只读的，不会影响请求执行。

```ts
import type { InspectorDataSource } from "@agentrail/app";

export class DbInspectorDataSource implements InspectorDataSource {
  async listSessions() {
    return db.sessions.findAll({
      select: ["tenantId", "sessionId", "userId", "updatedAt", "turns", "tokens"],
    });
  }
}
```

## 6. `SandboxMemoProvider`

当 Sandbox 容器启用后，Agent 会通过 Bind Mount 读取 `/workspace/memo/**`。对于非文件系统后端，`SandboxManager` 需要一个 `memoProvider` 来完成三件事：

1. 在容器创建时把 Memo 文档与 Tool Result Artifacts 镜像到临时目录
2. 把 Agent 在容器中通过 `Write` / `Edit` 做出的改动回写到后端
3. 当 Host 在容器外更新内容时，刷新运行中的镜像文件

通常 Session Store 本身就可以一并实现这组方法，因此可以把同一个实例直接传给 `SandboxManager`：

```ts
import { SandboxManager } from "@agentrail/capabilities";

const store = new MySessionStore();
const sandboxManager = new SandboxManager(process.env.AGENTRAIL_DATA_DIR!, { memoProvider: store });
```

## 7. 镜像刷新职责

`/workspace/memo/**` 在容器内是只读挂载，但 Host 仍可以更新挂载源目录。为了让正在运行的 Sandbox 立即看到变化，需要额外处理两类刷新：

### 7a. Compaction 写入的 Tool Result Artifacts

当 `compactToolResults` 写入 Tool Result Artifact 后，除了写入后端，还应同时刷新运行中 Sandbox 的镜像文件。

### 7b. `USER.md` Consolidation

`UserMemoryConsolidationService` 在后台重写 `USER.md`。如果把 `sandboxManager` 作为第 5 个参数传入，它会在每次写入后自动刷新所有活跃 Session 的镜像。

## 8. 在 `createAgentApp` 中接线

当这些部件准备好后，可统一传入 `createAgentApp`：

```ts
import { createAgentApp } from "@agentrail/app";
import { SandboxManager } from "@agentrail/capabilities";

const store = new MySessionStore();
const sandboxManager = new SandboxManager(process.env.AGENTRAIL_DATA_DIR!, { memoProvider: store });

const app = createAgentApp({
  sessionStore: store,
  sandboxManager,
  traceStoreFactory: (sessionRef) => createDbSessionTraceStore(sessionRef),
  createOrchestrationPersistence: (sessionRef) => createDbOrchestrationPersistence(sessionRef),
  inspector: new DbInspectorDataSource(),
  profiles: [defaultProfile],
  summarize,
  compaction: {
    triggerTokens: 80_000,
    minMessages: 20,
  },
});
```

## 9. 一致性与并发

框架本身不会跨这些契约强制事务。如果后端需要更强的一致性保障，例如消息写入与用量记录必须原子完成，应在 `appendMessages` 与 `recordTurn` 内部自行使用数据库事务。

Trace 与编排持久化从框架视角看属于旁路写入。写入失败会记录日志，但不会传播到 Agent。

## 10. 参考实现

`@agentrail/storage-postgres` 已经实现了上述大多数契约，可直接使用，也可作为参考：

```ts
import {
  PostgresSessionStore,
  PostgresSessionTraceStore,
  PostgresOrchestrationPersistence,
  PostgresInspectorDataSource,
  createSqlClient,
} from "@agentrail/storage-postgres";
```

同一个 `PostgresSessionStore` 实例可以同时充当：

- `AgentrailSessionStore`
- `UserSessionLister`
- `SandboxMemoProvider`

## 相关文档

- [配置 Session](./configure-sessions.md)
- [Session Store](../reference/session-store.md)
- [Inspector Route](../reference/inspector-route.md)
- [部署](./deployment.md)

## 说明

本页覆盖了自定义存储后端需要理解的主要契约与接线方式。对于某些超细节接口，例如完整的 `OrchestrationPersistence` 方法集与镜像刷新时序，建议继续对照 [英文原文](../../guides/build-a-storage-backend.md)。
