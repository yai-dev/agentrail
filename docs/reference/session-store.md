# Session Store Reference

The host layer depends on the `AgentrailSessionStore` contract rather than a concrete storage implementation.

## When To Read This Page

Read this page when:

- you want to replace the default filesystem-backed session manager
- you need to understand what the host actually requires from storage
- you are designing persistence boundaries for a custom host

## Responsibilities

- create or resume sessions
- load message history
- append messages
- record usage
- compact history when needed
- _(optional)_ read/write memo documents (`NOTES.md`, `TODO.md`, `USER.md`)
- _(optional)_ read/write tool result artifacts

The default implementation is the filesystem-backed `SessionManager` from `@agentrail/app`. A PostgreSQL implementation is available in `@agentrail/storage-postgres`.

## Interface

The full `AgentrailSessionStore` contract defined in `@agentrail/core`:

### `getOrCreate` _(required)_

```ts
getOrCreate(
  tenantId: string,
  userId: string,
  agentId: string,
  sessionId?: string,
): Promise<{ sessionId: string }>
```

Returns an existing session or creates a new one. If `sessionId` is omitted, a new UUID is generated.

### `loadMessages` _(required)_

```ts
loadMessages(tenantId: string, sessionId: string, limit?: number): Promise<Message[]>
```

Returns the most recent `limit` messages from the session. When `limit` is omitted, returns a reasonable recent window.

### `loadMessagesWithBudget` _(required)_

```ts
loadMessagesWithBudget(
  tenantId: string,
  sessionId: string,
  tokenBudget?: number,
): Promise<Message[]>
```

Returns as many recent messages as fit within the given token budget. Used by both the chat route and stream route to keep context within the model's context window.

### `loadAllMessages` _(required)_

```ts
loadAllMessages(tenantId: string, sessionId: string): Promise<Message[]>
```

Returns the complete, unbounded message history for a session. Used by the compaction system to decide whether to summarize old turns.

### `appendMessages` _(required)_

```ts
appendMessages(tenantId: string, sessionId: string, messages: Message[]): Promise<void>
```

Persists new messages to the session store after a turn completes.

### `recordTurn` _(required)_

```ts
recordTurn(tenantId: string, sessionId: string, usage: Usage): Promise<void>
```

Records token usage for the turn. Used for billing or observability.

### `compactIfNeeded` _(required)_

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

Runs compaction if the accumulated history exceeds `triggerTokens`. Calls `summarizeFn` to collapse old messages into a summary message and persists the compacted history. Returns `true` if compaction ran.

### `readMemoryDocument` _(optional)_

```ts
readMemoryDocument?(
  tenantId: string,
  ownerId: string,
  scope: "session" | "user",
  name: "NOTES.md" | "TODO.md" | "USER.md",
): Promise<string | null>
```

Reads a named memo document for a session or user. Called by the user-memory consolidation service and by context providers that inject memory into the agent's context.

**Required** when using `UserMemoryConsolidationService` with a non-filesystem store. `SessionManager` implements this automatically. If your store omits this method and `UserMemoryConsolidationService` is configured, the service will throw at runtime.

### `writeMemoryDocument` _(optional)_

```ts
writeMemoryDocument?(
  tenantId: string,
  ownerId: string,
  scope: "session" | "user",
  name: "NOTES.md" | "TODO.md" | "USER.md",
  content: string,
): Promise<void>
```

Writes a memo document. Counterpart to `readMemoryDocument`. Same requirements apply.

### `appendMemoryDocument` _(optional)_

```ts
appendMemoryDocument?(
  tenantId: string,
  ownerId: string,
  scope: "session" | "user",
  name: "NOTES.md" | "TODO.md" | "USER.md",
  content: string,
): Promise<void>
```

Appends to an existing memo document. Used by in-context memo tools (`write_notes`, `write_todo`).

### `readToolResultArtifact` _(optional)_

```ts
readToolResultArtifact?(
  sessionRef: SessionRef,
  toolCallId: string,
): Promise<string | null>
```

Reads a compacted tool result artifact. Called during history reconstruction when a tool result was stored separately to keep the message history compact.

### `writeToolResultArtifact` _(optional)_

```ts
writeToolResultArtifact?(
  sessionRef: SessionRef,
  toolCallId: string,
  content: string,
): Promise<void>
```

Writes a compacted tool result artifact. Called by `compactToolResults` when tool outputs are too large to keep inline.

### `listToolResultArtifactIds` _(optional)_

```ts
listToolResultArtifactIds?(sessionRef: SessionRef): Promise<string[]>
```

Returns all tool-call IDs whose artifacts are stored for this session. Used by `SandboxManager` at sandbox creation time to pre-populate the `/workspace/memo/session/tool-results/` directory so the agent can read compacted artifacts from inside the container.

When not implemented, the tool-results directory starts empty inside the sandbox. Already-stored artifacts will not be accessible unless the session happens to use the filesystem backend (where they live at the expected path automatically).

---

## Implementing a Custom Store

A custom store must implement all **required** methods. The optional methods unlock additional features (memo documents, tool result compaction). You can omit optional methods and add them incrementally as needed.

### Minimal in-memory example

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

  async loadMessages(_tenantId: string, sessionId: string, limit?: number): Promise<Message[]> {
    const msgs = this.sessions.get(sessionId)?.messages ?? [];
    return limit ? msgs.slice(-limit) : msgs.slice(-50);
  }

  async loadMessagesWithBudget(
    _tenantId: string,
    sessionId: string,
    tokenBudget?: number,
  ): Promise<Message[]> {
    const messages = this.sessions.get(sessionId)?.messages ?? [];
    const budget = tokenBudget ?? 100_000;
    let totalChars = 0;
    const result: Message[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const charCount = JSON.stringify(messages[i]).length;
      if (totalChars + charCount > budget * 4) break;
      totalChars += charCount;
      result.unshift(messages[i]);
    }
    return result;
  }

  async loadAllMessages(_tenantId: string, sessionId: string): Promise<Message[]> {
    return this.sessions.get(sessionId)?.messages ?? [];
  }

  async appendMessages(_tenantId: string, sessionId: string, messages: Message[]): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) session.messages.push(...messages);
  }

  async recordTurn(_tenantId: string, sessionId: string, usage: Usage): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) session.usageHistory.push(usage);
  }

  async compactIfNeeded(
    _tenantId: string,
    sessionId: string,
    summarizeFn: (messages: Message[]) => Promise<string>,
    options?: { triggerTokens?: number; compactFraction?: number; preloadedMessages?: Message[] },
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const triggerTokens = options?.triggerTokens ?? 80_000;
    const compactFraction = options?.compactFraction ?? 0.5;
    const messages = options?.preloadedMessages ?? session.messages;

    const estimatedTokens = JSON.stringify(messages).length / 4;
    if (estimatedTokens < triggerTokens) return false;

    const cutoff = Math.floor(messages.length * compactFraction);
    const summary = await summarizeFn(messages.slice(0, cutoff));

    session.messages = [
      { role: "user", content: `[Conversation summary]: ${summary}` },
      ...messages.slice(cutoff),
    ];
    return true;
  }
}
```

**Using the custom store with `createAgentApp`:**

```ts
import { createAgentApp } from "@agentrail/app";
import { InMemorySessionStore } from "./in-memory-session-store.js";

const app = createAgentApp({
  sessionStore: new InMemorySessionStore(),
  profiles: [defaultProfile],
});
```

### Production database backend

For a production database-backed implementation, replace the `Map` with queries to your database in `loadMessages`, `appendMessages`, and `compactIfNeeded`. The interface is intentionally small so each method maps cleanly to one or two queries.

A full PostgreSQL implementation is available out of the box:

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

`PostgresSessionStore` implements all required methods plus the optional memo document and tool result artifact methods, so all host features work without additional configuration.
