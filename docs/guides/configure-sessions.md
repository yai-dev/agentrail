# Configure Sessions

Sessions are how Agentrail persists conversation history between requests. This guide covers how to configure the default session storage and how to replace it with a custom implementation.

## Prerequisites

Read this guide after:

- [Quickstart](quickstart.md)
- [Concepts: Sessions](../concepts/sessions.md)

## The Default: `SessionManager`

The default session store is `SessionManager` from `@agentrail/memo`. It persists all session data to the local filesystem under a root `dataDir`:

```ts
import { SessionManager } from "@agentrail/memo";

const sessionStore = new SessionManager("/data/agentrail");
```

Pass it to your route factories:

```ts
import { createChatRoute } from "@agentrail/host";
import { SessionManager } from "@agentrail/memo";

const sessionStore = new SessionManager("/data/agentrail");

app.route(
  "/chat",
  createChatRoute({
    defaultAgentId: "default",
    sessionStore,
    resolveProfile,
    summarize,
    compaction: { triggerTokens: 80_000, minMessages: 20 },
  }),
);
```

## Directory Layout

`SessionManager` organizes data under the `dataDir` using this structure:

```
{dataDir}/
  tenants/
    {tenantId}/
      sessions/
        {sessionId}/
          messages.jsonl     # conversation messages
          session.jsonl      # session metadata and usage records
          compaction/        # compaction archives
      users/
        {userId}/
          USER.md            # user memory notes
```

Each session is isolated to its own directory. Deleting a session directory clears that session's history without affecting others.

## Choosing a `dataDir`

For **local development**, the default `~/.agentrail` is fine:

```ts
const sessionStore = new SessionManager(
  process.env.AGENTRAIL_DATA_DIR ?? `${process.env.HOME}/.agentrail`,
);
```

For **production**, point `dataDir` at a persistent volume so sessions survive container restarts:

```ts
const sessionStore = new SessionManager(process.env.AGENTRAIL_DATA_DIR ?? "/data/agentrail");
```

In Docker, mount a named volume at `/data/agentrail`:

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

## Managing Sessions at Runtime

`SessionManager` exposes utility methods beyond the basic `AgentrailSessionStore` contract:

```ts
// List all sessions for a user
const sessions = await sessionStore.listSessions(tenantId, userId);

// Build a memory index for context injection
const memoryIndex = await sessionStore.buildMemoryIndex(tenantId, userId, sessionId);

// Get the session directory path (synchronous)
const dir = sessionStore.getSessionDir(tenantId, sessionId);
```

These are useful when building session management UIs or context provider implementations.

## Implementing a Custom Session Store

If the filesystem-backed `SessionManager` does not fit your requirements (for example, you need database-backed storage or multi-server shared state), implement the `AgentrailSessionStore` interface from `@agentrail/host`:

```ts
import type { AgentrailSessionStore } from "@agentrail/host";
import type { Message, Usage } from "@agentrail/runtime-core";

export class DatabaseSessionStore implements AgentrailSessionStore {
  async getOrCreate(tenantId, userId, agentId, sessionId?) {
    // Find or create a session row in your DB
    const id = sessionId ?? crypto.randomUUID();
    await db.sessions.upsert({ id, tenantId, userId, agentId });
    return { sessionId: id };
  }

  getSessionDir(tenantId, sessionId) {
    // Return a logical path or temp dir for sandbox/attachment use
    return `/tmp/sessions/${tenantId}/${sessionId}`;
  }

  async loadMessages(tenantId, sessionId, limit?) {
    return db.messages.findMany({ sessionId, limit });
  }

  async loadMessagesWithBudget(tenantId, sessionId, tokenBudget?) {
    // Load recent messages that fit within the token budget
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
    // Load full history, check token count, call summarizeFn if needed
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

The minimum required methods are all eight listed above. The most frequently called are `loadMessagesWithBudget`, `appendMessages`, `recordTurn`, and `compactIfNeeded`.

## Horizontal Scaling Considerations

`SessionManager` writes to the local filesystem, which means sessions are tied to one server instance. For horizontal scaling across multiple instances, you need either:

- a **shared filesystem** (NFS, EFS, etc.) mounted at the same path on all instances
- a **custom `AgentrailSessionStore`** backed by a database (PostgreSQL, Redis, etc.)

The session store interface is designed to make this swap straightforward — replace `SessionManager` with your custom implementation and pass it to the same route factories.

## Related Concepts

- [Sessions](../concepts/sessions.md)
- [Context & Compaction](../concepts/context-and-compaction.md)

## Related Reference

- [Session Store Reference](../reference/session-store.md)
- [Deployment Guide](deployment.md)
