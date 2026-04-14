# 配置 Session

Session 用于在多次请求之间持久化对话历史。本页说明如何配置默认的 Session 存储，以及如何替换为自定义实现。

## 适用时机

建议在读完以下内容后阅读本页：

- [快速开始](./quickstart.md)
- [Sessions（英文）](../../concepts/sessions.md)

## 默认实现：`SessionManager`

默认的 Session Store 是 `@agentrail/app` 提供的 `SessionManager`。它会把所有 Session 数据写入本地文件系统中的 `dataDir`：

```ts
import { SessionManager } from "@agentrail/app";

const sessionManager = new SessionManager("/data/agentrail");
```

如果把 `dataDir` 传给 `createAgentApp`，它会在内部管理 `SessionManager`：

```ts
import { createAgentApp } from "@agentrail/app";

const app = createAgentApp({
  dataDir: "/data/agentrail",
  profiles: [defaultProfile],
  summarize,
  compaction: {
    triggerTokens: 80_000,
    minMessages: 20,
    reactive: { enabled: true },
  },
});
```

请求边界上的 Compaction 会把摘要写回 Session 存储。长回合中的响应式 Compaction 配置在 `compaction.reactive` 下，但它只改写当前请求内存中的历史。

如果需要直接使用 `SessionManager` 的辅助能力，例如列出 Session 或构建 Memory Index，可单独实例化：

```ts
import { SessionManager } from "@agentrail/app";

export const sessionManager = new SessionManager("/data/agentrail");
```

## 目录结构

`SessionManager` 会按以下结构组织 `dataDir`：

```text
{dataDir}/
  tenants/
    {tenantId}/
      sessions/
        {sessionId}/
          messages.jsonl
          session.jsonl
          compaction/
      users/
        {userId}/
          USER.md
```

每个 Session 都有单独目录。删除某个 Session 目录，只会清掉对应会话，不影响其他数据。

## 如何选择 `dataDir`

在本地开发中，默认的 `~/.agentrail` 通常足够：

```ts
const sessionManager = new SessionManager(
  process.env.AGENTRAIL_DATA_DIR ?? `${process.env.HOME}/.agentrail`,
);
```

在生产环境中，应把 `dataDir` 指向持久化卷，确保容器重启后 Session 仍能保留：

```ts
const sessionManager = new SessionManager(process.env.AGENTRAIL_DATA_DIR ?? "/data/agentrail");
```

在 Docker 中，可以把命名卷挂到 `/data/agentrail`：

```yaml
services:
  server:
    volumes:
      - agentrail-data:/data/agentrail
    environment:
      - AGENTRAIL_DATA_DIR=/data/agentrail

volumes:
  agentrail-data:
```

## 运行期管理 Session

`SessionManager` 除了 `AgentrailSessionStore` 的基础契约外，还提供了一些辅助方法：

```ts
const sessions = await sessionManager.listSessions(tenantId, userId);
const memoryIndex = await sessionManager.buildMemoryIndex(tenantId, userId, sessionId);
```

这些方法常用于构建 Session 管理 UI，或为 `Context Provider` 提供额外数据。

## 自定义 Session Store

如果基于文件系统的 `SessionManager` 不适合当前需求，例如需要数据库存储或多实例共享状态，可以实现 `@agentrail/app` 中的 `AgentrailSessionStore`，然后通过 `sessionStore` 传给 `createAgentApp`：

```ts
import type { AgentrailSessionStore } from "@agentrail/app";
import type { Message, Usage } from "@agentrail/core";

export class DatabaseSessionStore implements AgentrailSessionStore {
  async getOrCreate(tenantId, userId, agentId, sessionId?) {
    const id = sessionId ?? crypto.randomUUID();
    await db.sessions.upsert({ id, tenantId, userId, agentId });
    return { sessionId: id };
  }

  async loadMessages(tenantId, sessionId, limit?) {
    return db.messages.findMany({ sessionId, limit });
  }

  async loadMessagesWithBudget(tenantId, sessionId, tokenBudget?) {
    const all = await db.messages.findMany({ sessionId, orderBy: "desc" });
    return trimToTokenBudget(all, tokenBudget);
  }

  async loadAllMessages(tenantId, sessionId) {
    return db.messages.findMany({ sessionId });
  }

  async appendMessages(tenantId, sessionId, messages: Message[]) {
    await db.messages.insertMany(messages.map((m) => ({ ...m, sessionId })));
  }

  async recordTurn(tenantId, sessionId, usage: Usage) {
    await db.usage.insert({ sessionId, ...usage });
  }

  async compactIfNeeded(tenantId, sessionId, summarizeFn, options?) {
    const messages = await this.loadAllMessages(tenantId, sessionId);
    if (estimateTokens(messages) < (options?.triggerTokens ?? 80_000)) {
      return false;
    }
    const summary = await summarizeFn(messages);
    await db.messages.replaceAll(sessionId, [summaryMessage(summary)]);
    return true;
  }
}
```

以上七个方法是最基础的实现范围，其中最常被调用的是：

- `loadMessagesWithBudget`
- `appendMessages`
- `recordTurn`
- `compactIfNeeded`

### 补充 Memo 文档与 Sandbox 支持

如果 Store 还实现了可选的 Memo 与 Tool Result 方法，就可以启用 `write_notes`、`write_todo` 这类工具，以及 Sandbox 内部完整的 `/workspace/memo/**` 访问：

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

应把同一个 Store 实例同时作为 `SandboxManagerOptions` 的 `memoProvider` 传入 `SandboxManager`，这样 `SandboxManager` 才能在容器创建时把 Memo 文档和 Tool Result Artifacts 镜像到容器中，并把 Agent 在容器中的写入回写到 Store。

## 横向扩展时的注意点

`SessionManager` 写入的是本地文件系统，因此 Session 天然绑定到单个服务实例。如果需要多实例横向扩展，需要满足以下两种条件之一：

- 所有实例共享同一套文件系统，例如 NFS、EFS
- 使用数据库或其他共享存储实现自定义 `AgentrailSessionStore`

Session Store 接口本身就是为这种替换准备的。实现 `AgentrailSessionStore` 后，直接传给 `createAgentApp({ sessionStore })` 即可。

## 相关概念

- [Sessions（英文）](../../concepts/sessions.md)
- [上下文与压缩](../concepts/context-and-compaction.md)

## 相关参考

- [Session Store Reference](../reference/session-store.md)
- [部署](./deployment.md)
