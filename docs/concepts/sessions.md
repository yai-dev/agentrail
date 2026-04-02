# Sessions

A session is the unit of conversation persistence in Agentrail. It holds the message history for a single user's ongoing conversation with an agent.

## What a Session Is

Each session has:

- a unique `sessionId` (UUID)
- an owner identity: `tenantId` + `userId` + `agentId`
- an ordered list of messages (the conversation history)
- a cumulative token usage record

Sessions are created on the first request and resumed on subsequent requests by passing the `sessionId` in the request body. If no `sessionId` is provided, a new session is created automatically.

## Session Lifecycle

```
First request (no sessionId)
    │
    ▼
getOrCreate → new session created → sessionId returned in response
    │
    ▼
Client stores sessionId and sends it on subsequent requests
    │
    ▼
getOrCreate → existing session resumed
```

## Session Store Contract

The host layer depends on the `AgentrailSessionStore` contract rather than any concrete storage implementation. This means you can swap out the storage backend without changing your host code.

The contract includes:

| Method                   | Called when                                                                 |
| ------------------------ | --------------------------------------------------------------------------- |
| `getOrCreate`            | Every request — creates or resumes the session                              |
| `getSessionDir`          | Before agent construction — returns the session data path                   |
| `loadMessagesWithBudget` | Every request — loads history trimmed to the token budget                   |
| `loadAllMessages`        | During compaction — loads full history to assess whether to compact         |
| `appendMessages`         | After agent completes — persists the new turn's messages                    |
| `recordTurn`             | After agent completes — persists token usage                                |
| `compactIfNeeded`        | During each request — summarizes old history if token threshold is exceeded |

## Default Implementation: `SessionManager`

The default session store is `SessionManager` from `@agentrail/memo`. It uses the local filesystem to persist sessions, with one directory per session:

```ts
import { SessionManager } from "@agentrail/memo";

const sessionStore = new SessionManager("/tmp/agentrail-sessions");
```

The path is the root directory under which all tenant/session data is stored. In production, use a persistent volume or replace `SessionManager` with a database-backed implementation.

## Turn Persistence

A **turn** is one complete interaction: a user message followed by the agent's full response (which may involve multiple LLM calls and tool executions).

After each turn, the host:

1. Calls `appendMessages` to write the new user and assistant messages
2. Calls `recordTurn` to record token usage for billing or observability

Turn persistence happens after the agent has finished and the SSE stream has closed. Plugins can react to this via the `onTurnPersisted` hook.

## History Loading with Token Budget

The host does not load unlimited history. On each request, it calls `loadMessagesWithBudget` to retrieve as many recent messages as fit within the model's context window (minus room for the current turn and context providers).

This ensures the context window is never overflowed by long sessions. The `contextWindow` field on the profile controls the token limit used for this calculation.

## Implementing a Custom Store

Any object that satisfies the `AgentrailSessionStore` interface can be used as a session store. Common reasons to build a custom one:

- storing sessions in a database instead of the filesystem
- adding multi-tenant access controls
- integrating with an existing message persistence layer
- adding search or audit capabilities over session history

See the [Session Store Reference](../reference/session-store.md) for the full interface.

## Related Concepts

- [Host](host.md)
- [Context & Compaction](context-and-compaction.md)
- [Profiles](profiles.md)

## Related Reference

- [Session Store Reference](../reference/session-store.md)
