# Session Store Reference

The host layer depends on the `AgentrailSessionStore` contract rather than a concrete storage implementation.

## When To Read This Page

Read this page when:

- you want to replace the default filesystem-backed session manager
- you need to understand what the host actually requires from storage
- you are designing persistence boundaries for a custom host

## Responsibilities

- create or resume sessions
- resolve session directories
- load message history
- append messages
- record usage
- compact history when needed

The default examples use the filesystem-backed session manager from `@agentrail/memo`.

## Interface

The full `AgentrailSessionStore` contract defined in `packages/host/src/types.ts`:

### `getOrCreate`

```ts
getOrCreate(
  tenantId: string,
  userId: string,
  agentId: string,
  sessionId?: string,
): Promise<{ sessionId: string }>
```

Returns an existing session or creates a new one. If `sessionId` is omitted, a new UUID is generated.

### `getSessionDir`

```ts
getSessionDir(tenantId: string, sessionId: string): string
```

Returns the filesystem path (or equivalent logical path) for the session's data directory. Called synchronously by the host before agent construction.

### `loadMessages`

```ts
loadMessages(tenantId: string, sessionId: string, limit?: number): Promise<Message[]>
```

Returns the most recent `limit` messages from the session. When `limit` is omitted, returns a reasonable recent window.

### `loadMessagesWithBudget`

```ts
loadMessagesWithBudget(
  tenantId: string,
  sessionId: string,
  tokenBudget?: number,
): Promise<Message[]>
```

Returns as many recent messages as fit within the given token budget. Used by both the chat route and stream route to keep context within the model's context window.

### `loadAllMessages`

```ts
loadAllMessages(tenantId: string, sessionId: string): Promise<Message[]>
```

Returns the complete, unbounded message history for a session. Used by the compaction system to decide whether to summarize old turns.

### `appendMessages`

```ts
appendMessages(tenantId: string, sessionId: string, messages: Message[]): Promise<void>
```

Persists new messages to the session store after a turn completes.

### `recordTurn`

```ts
recordTurn(tenantId: string, sessionId: string, usage: Usage): Promise<void>
```

Records token usage for the turn. Used for billing or observability.

### `compactIfNeeded`

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

## Implementing a Custom Store

A custom store must implement all methods above. The most commonly replaced parts are `loadMessages`, `loadAllMessages`, `appendMessages`, and `compactIfNeeded` — these are the methods the host calls on every request path.

Below is a minimal in-memory implementation that satisfies the full interface. Use it as a starting point before wiring up a real database backend:

```ts
import { randomUUID } from "node:crypto";
import type { Message, Usage } from "@agentrail/runtime-core";
import type { AgentrailSessionStore } from "@agentrail/host";

interface SessionRecord {
  sessionId: string;
  messages: Message[];
  usageHistory: Usage[];
}

export class InMemorySessionStore implements AgentrailSessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  async getOrCreate(
    tenantId: string,
    userId: string,
    agentId: string,
    sessionId?: string,
  ): Promise<{ sessionId: string }> {
    const id = sessionId ?? randomUUID();
    if (!this.sessions.has(id)) {
      this.sessions.set(id, { sessionId: id, messages: [], usageHistory: [] });
    }
    return { sessionId: id };
  }

  getSessionDir(tenantId: string, sessionId: string): string {
    // Return a logical path — the in-memory store doesn't use the filesystem,
    // but the host calls this synchronously before agent construction.
    return `/tmp/sessions/${tenantId}/${sessionId}`;
  }

  async loadMessages(tenantId: string, sessionId: string, limit?: number): Promise<Message[]> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    const msgs = session.messages;
    return limit ? msgs.slice(-limit) : msgs.slice(-50);
  }

  async loadMessagesWithBudget(
    tenantId: string,
    sessionId: string,
    tokenBudget?: number,
  ): Promise<Message[]> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    // Simplified: estimate ~4 chars per token; trim from the front
    const budget = tokenBudget ?? 100_000;
    const messages = [...session.messages];
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

  async loadAllMessages(tenantId: string, sessionId: string): Promise<Message[]> {
    return this.sessions.get(sessionId)?.messages ?? [];
  }

  async appendMessages(tenantId: string, sessionId: string, messages: Message[]): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push(...messages);
    }
  }

  async recordTurn(tenantId: string, sessionId: string, usage: Usage): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.usageHistory.push(usage);
    }
  }

  async compactIfNeeded(
    tenantId: string,
    sessionId: string,
    summarizeFn: (messages: Message[]) => Promise<string>,
    options?: {
      triggerTokens?: number;
      compactFraction?: number;
      preloadedMessages?: Message[];
    },
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const triggerTokens = options?.triggerTokens ?? 80_000;
    const compactFraction = options?.compactFraction ?? 0.5;
    const messages = options?.preloadedMessages ?? session.messages;

    // Estimate token count (rough: 4 chars ≈ 1 token)
    const estimatedTokens = JSON.stringify(messages).length / 4;
    if (estimatedTokens < triggerTokens) return false;

    // Summarize the oldest fraction of messages
    const cutoff = Math.floor(messages.length * compactFraction);
    const oldMessages = messages.slice(0, cutoff);
    const recentMessages = messages.slice(cutoff);

    const summary = await summarizeFn(oldMessages);

    session.messages = [
      { role: "user", content: `[Conversation summary]: ${summary}` },
      ...recentMessages,
    ];

    return true;
  }
}
```

**Using the custom store:**

```ts
import { createStreamRoute } from "@agentrail/host";
import { InMemorySessionStore } from "./in-memory-session-store.js";

app.route(
  "/api/stream",
  createStreamRoute({
    sessionStore: new InMemorySessionStore(),
    // ...
  }),
);
```

For a production database-backed implementation, replace the `Map` with queries to your database in `loadMessages`, `appendMessages`, and `compactIfNeeded`. The interface is intentionally small so each method maps cleanly to one or two queries.
