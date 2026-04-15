# Build a Storage Backend

This is an **advanced guide**. For most deployments, `SessionManager` with a persistent volume or shared filesystem (NFS, EFS, etc.) is the recommended approach and requires no custom implementation.

Read this guide only when you have a specific requirement that cannot be met by the default filesystem layer — for example, integrating with an existing persistence layer, adding custom access controls, or building a deeply embedded deployment where a shared filesystem is not available.

## Prerequisites

- [Configure Sessions](configure-sessions.md)
- [Session Store Reference](../reference/session-store.md)
- [Inspector Route Reference](../reference/inspector-route.md)

---

## Contract overview

A complete custom backend touches six distinct contracts, plus mirror refresh responsibilities that apply when a sandbox is active. Not all are required for every deployment; the table below shows which features each one unlocks:

| Contract                   | Required for                                    | Package                              |
| -------------------------- | ----------------------------------------------- | ------------------------------------ |
| `AgentrailSessionStore`    | All requests — messages, compaction, turns      | `@agentrail/core` / `@agentrail/app` |
| `UserSessionLister`        | User-memory consolidation background service    | `@agentrail/app`                     |
| `SessionTraceStore`        | Workflow trace persistence (Inspector timeline) | `@agentrail/app`                     |
| `OrchestrationPersistence` | Multi-agent orchestration state                 | `@agentrail/capabilities`            |
| `InspectorDataSource`      | Agentrail Inspector read API                    | `@agentrail/app`                     |
| `SandboxMemoProvider`      | `/workspace/memo/**` inside containers          | `@agentrail/capabilities`            |

The sections below cover each contract in turn, then show how to wire them into `createAgentApp`.

---

## 1. `AgentrailSessionStore`

The core per-request contract. Seven methods are required; the optional memo and artifact methods unlock memory tools and full sandbox access.

### Required methods

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
    // trim from the oldest end until total fits in budget
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

### Optional memo methods

Implement these to enable in-context memo tools (`write_notes`, `write_todo`) and full `/workspace/memo/**` access inside containers.

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

### Optional tool-result artifact methods

Implement these to persist compacted tool-result artifacts. Without them, compaction still works but large tool outputs cannot be retrieved from inside the sandbox later.

```ts
async readToolResultArtifact(sessionRef, toolCallId) {
  return db.toolResultArtifacts.findOne({ sessionRef, toolCallId }) ?? null;
}

async writeToolResultArtifact(sessionRef, toolCallId, content) {
  await db.toolResultArtifacts.upsert({ sessionRef, toolCallId, content });
}

```

> **Note:** `listToolResultArtifactIds` is **not** part of `AgentrailSessionStore`. It belongs to the `SandboxMemoProvider` interface (see [section 6](#6-sandboxmemoprovider-sandboxmanager-option) below). Implement it when also passing your store instance as `memoProvider` to `SandboxManager`.

---

## 2. `UserSessionLister`

The user-memory consolidation background service uses this interface to scan sessions when deciding whether to rebuild a user's `USER.md` profile. `SessionManager` implements it automatically; for custom backends, implement it alongside (or as part of) your session store:

```ts
import type { UserSessionLister } from "@agentrail/app";
import type { SessionMeta } from "@agentrail/core";

export class MySessionStore implements AgentrailSessionStore, UserSessionLister {
  // ... required session store methods above ...

  async listSessionsByUser(tenantId, userId): Promise<SessionMeta[]> {
    return db.sessions.findMany({
      tenantId,
      userId,
      select: ["sessionId", "updatedAt"],
    });
  }
}
```

Pass the same instance as both `sessionStore` and the second argument to `UserMemoryConsolidationService`:

```ts
import { UserMemoryConsolidationService } from "@agentrail/app";

const store = new MySessionStore();

const consolidationService = new UserMemoryConsolidationService(
  store, // AgentrailSessionStore
  store, // UserSessionLister
  dataDir,
  config,
  sandboxManager, // optional — propagates USER.md updates to live mirrors
);
```

---

## 3. `SessionTraceStore`

The trace store persists workflow events (turn start/end, tool calls, errors) for later replay in the Agentrail Inspector timeline. The interface is minimal:

```ts
export interface SessionTraceStore<TEnvelope = Record<string, unknown>> {
  appendEnvelope(envelope: TEnvelope): Promise<void>;
  loadEnvelopes(): Promise<TEnvelope[]>;
}
```

Implement a factory and pass it to `createAgentApp`:

```ts
import type { SessionRef } from "@agentrail/core";
import type { SessionTraceStore, WorkflowTraceEventEnvelope } from "@agentrail/app";

function createDbSessionTraceStore(
  sessionRef: SessionRef,
): SessionTraceStore<WorkflowTraceEventEnvelope> {
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

The factory is called at most once per session (cached in `createAgentApp`), so it is safe to open a database connection or prepare a statement inside the factory.

---

## 4. `OrchestrationPersistence`

Multi-agent orchestration requires a session-scoped persistence layer to checkpoint agent state, buffer mailbox events, and recover after crashes.

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
    async recoverState() {
      const snapshot = await this.loadSnapshot();
      const events = await this.loadEvents();
      return recoverOrchestrationState(snapshot, events); // framework helper
    },
    async appendMailboxEvent(agentId, event) {
      await db.mailboxEvents.insert({ sessionRef, agentId, ...event });
    },
    async loadMailboxEvents(agentId) {
      return db.mailboxEvents.findAll({ sessionRef, agentId });
    },
    async loadMailboxState(agentId) {
      return db.mailboxStates.findOne({ sessionRef, agentId }) ?? {};
    },
    async writeMailboxState(agentId, state) {
      await db.mailboxStates.upsert({ sessionRef, agentId, state });
    },
    async loadAgentHistory(agentId) {
      return db.agentHistory.findOne({ sessionRef, agentId }) ?? [];
    },
    async writeAgentHistory(agentId, history) {
      await db.agentHistory.upsert({ sessionRef, agentId, history });
    },
  };
}
```

Pass the factory to `createAgentApp`:

```ts
const app = createAgentApp({
  sessionStore: store,
  createOrchestrationPersistence: (sessionRef) => createDbOrchestrationPersistence(sessionRef),
  profiles: [defaultProfile],
});
```

---

## 5. `InspectorDataSource`

`createInspectorRoute` reads session data through this interface. It is read-only and does not affect the request pipeline.

```ts
import type { InspectorDataSource } from "@agentrail/app";

export class DbInspectorDataSource implements InspectorDataSource {
  async listSessions() {
    return db.sessions.findAll({
      select: ["tenantId", "sessionId", "userId", "updatedAt", "turns", "tokens"],
    });
  }

  async loadMessages(tenantId, sessionId) {
    return db.messages.findAll({ tenantId, sessionId, orderBy: "sequence" });
  }

  async loadTraceEnvelopes(tenantId, sessionId) {
    const sessionRef = `${tenantId}:${sessionId}`;
    return db.traceEvents.findAll({ sessionRef, orderBy: "sequence" });
  }

  async loadOrchestrationState(tenantId, sessionId) {
    const sessionRef = `${tenantId}:${sessionId}`;
    return db.orchSnapshots.findLatest({ sessionRef }) ?? null;
  }

  async loadOrchestrationEvents(tenantId, sessionId) {
    const sessionRef = `${tenantId}:${sessionId}`;
    return db.orchEvents.findAll({ sessionRef, orderBy: "sequence" });
  }
}
```

Pass it to `createAgentApp`:

```ts
const app = createAgentApp({
  inspector: new DbInspectorDataSource(),
  profiles: [defaultProfile],
});
```

---

## 6. `SandboxMemoProvider` (SandboxManager option)

When a sandbox container is active, the agent reads `/workspace/memo/**` paths from the host filesystem via a bind-mount. For non-filesystem backends, `SandboxManager` needs a `memoProvider` to:

1. **Snapshot** memo documents and tool-result artifacts into a temporary host directory at sandbox-creation time, then bind-mount that directory read-only into the container.
2. **Write back** agent edits (via the `Write` / `Edit` tools) to the backing store.
3. **Refresh** specific mirror files whenever the host updates the store outside the agent's tool path (compaction artifacts, USER.md consolidation).

Any object that satisfies `SandboxMemoProvider` can be passed. Your session store likely already implements all of these methods:

```ts
import { SandboxManager } from "@agentrail/capabilities";

const store = new MySessionStore();

const sandboxManager = new SandboxManager(process.env.AGENTRAIL_DATA_DIR!, { memoProvider: store });
```

`SandboxMemoProvider` methods (all optional except `readMemoryDocument`):

| Method                      | Direction | When called                                                |
| --------------------------- | --------- | ---------------------------------------------------------- |
| `readMemoryDocument`        | Read      | Sandbox creation — snapshot NOTES.md, TODO.md, USER.md     |
| `writeMemoryDocument`       | Write     | Agent uses `Write`/`Edit` on a memo path                   |
| `appendMemoryDocument`      | Write     | In-context memo tools (`write_notes`, `write_todo`)        |
| `readToolResultArtifact`    | Read      | Sandbox creation (paired with `listToolResultArtifactIds`) |
| `writeToolResultArtifact`   | Write     | Agent uses `Write`/`Edit` on a tool-results path           |
| `listToolResultArtifactIds` | Read      | Sandbox creation — pre-populate tool-results directory     |

---

## 7. Mirror refresh responsibilities

The `/workspace/memo/**` mount is **read-only** inside the container. The host can still update files on the host-side of the bind-mount, and the running container will see the change immediately. This is how compaction and memory consolidation deliver fresh content to a live sandbox.

Two host-side write paths require a manual mirror refresh call:

### 7a. Compacted tool-result artifacts (compaction)

When `compactToolResults` writes a tool-result artifact, it calls your `writeToolResultArtifact` callback. Immediately after writing to the store, also write to the live sandbox mirror so the container can read the file without waiting for a restart.

Wire this in your profile's `memoryContext` builder:

```ts
import { memoryContext } from "@agentrail/capabilities";
import { compactToolResults } from "@agentrail/app";

memoryContext({
  buildMemoryIndex: (ctx) => store.buildMemoryIndex(ctx.tenantId, ctx.userId, ctx.sessionId),

  writeToolResultArtifact: async (ctx, toolCallId, content) => {
    await Promise.all([
      // 1. Persist to backing store
      store.writeToolResultArtifact?.(ctx.sessionRef, toolCallId, content),
      // 2. Refresh the live sandbox mirror
      sandboxManager.refreshMemoMirror(
        ctx.sessionId,
        `/workspace/memo/session/tool-results/${toolCallId}.txt`,
        content,
      ),
    ]);
  },

  compactMessages: (msgs, ctx) =>
    compactToolResults(msgs, { writeToolResultArtifact: ctx?.writeToolResultArtifact }),
});
```

`sandboxManager.refreshMemoMirror` is a no-op when the session has no active sandbox or when using a filesystem backend (where the bind-mount IS the real path).

### 7b. USER.md consolidation

`UserMemoryConsolidationService` rewrites `USER.md` as a background task. Pass `sandboxManager` as the fifth constructor argument; the service automatically calls `sandboxManager.refreshUserMemoMirrorForAllSessions(...)` after every write:

```ts
const consolidationService = new UserMemoryConsolidationService(
  store, // AgentrailSessionStore
  store, // UserSessionLister
  dataDir,
  memoryConfig,
  sandboxManager, // propagates USER.md updates to all active session mirrors
);
```

---

## 8. Wiring everything in `createAgentApp`

Once all pieces are implemented, pass them to `createAgentApp`:

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

Start the consolidation service separately (it is not managed by `createAgentApp`):

```ts
const consolidationService = new UserMemoryConsolidationService(
  store,
  store,
  process.env.AGENTRAIL_DATA_DIR!,
  memoryConfig,
  sandboxManager,
);
consolidationService.start();
```

---

## 9. Atomicity and concurrency notes

The framework does not enforce transactions across contracts. If your backend requires consistency guarantees (e.g. atomically updating messages and usage), wrap them in a database transaction inside `appendMessages` + `recordTurn`. The call order is always `appendMessages` then `recordTurn` within a single turn.

Trace and orchestration persistence calls are fire-and-forget from the framework's perspective — write failures are logged but never propagated to the agent.

---

## Related

- [Configure Sessions](configure-sessions.md)
- [Session Store Reference](../reference/session-store.md)
- [Inspector Route Reference](../reference/inspector-route.md)
- [Deployment Guide](deployment.md)
