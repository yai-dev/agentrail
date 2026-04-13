# Inspector Route Reference

The Inspector route exposes a read-only HTTP API consumed by the [Agentrail Inspector](https://github.com/yai-dev/agentrail-inspector) — a self-hosted observability UI for browsing sessions, execution traces, and multi-agent orchestration graphs.

## Enabling the Inspector

### Filesystem backend (default)

Pass `inspector: true` to `createAgentApp`. Requires `dataDir` to be set:

```ts
import { createAgentApp } from "@agentrail/app";

const app = createAgentApp({
  dataDir: "./data",
  profiles: [myProfile],
  inspector: true,
});
```

The route is mounted at the fixed path `/__inspector`. The Agentrail Inspector Docker image's nginx proxy hardcodes this prefix, so the mount path is not configurable in v1.

### Custom data source (database backend)

Pass an `InspectorDataSource` object as the `inspector` option:

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

Any object implementing the `InspectorDataSource` interface is accepted — you can write a custom adapter for any storage backend.

**Constraints:**

- `inspector: true` requires `dataDir` and is incompatible with a custom `sessionStore`. An error is thrown at startup if either invariant is violated.
- Passing an explicit `InspectorDataSource` works with any `sessionStore` configuration, including custom stores.

## Running the Inspector UI

Pull and run the Inspector Docker image, pointing it at your Agentrail app:

```bash
docker run -d \
  -p 8080:80 \
  -e AGENTRAIL_URL=http://host.docker.internal:3000 \
  --name inspector \
  ghcr.io/yai-dev/agentrail-inspector:latest
```

Then open `http://localhost:8080`.

Or use the reference Docker Compose file from the [agentrail-inspector](https://github.com/yai-dev/agentrail-inspector) repository.

## Endpoints

All endpoints are relative to `/__inspector`.

### `GET /sessions`

Returns a list of all sessions across all tenants with enriched metadata.

**Response:**

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

---

### `GET /sessions/:sessionId/trace`

Returns the merged trace for a session: runtime events (agent loop, tools, compaction) and orchestration events (sub-agent lifecycle), ordered chronologically.

**Query parameters:**

| Parameter  | Default     | Description                  |
| ---------- | ----------- | ---------------------------- |
| `tenantId` | `"default"` | Tenant that owns the session |

**Response:**

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

Orchestration events are appended after runtime events and assigned sequence numbers that continue from where the runtime sequence ends, so clients can sort purely by `sequence`.

---

### `GET /sessions/:sessionId/orchestration`

Returns the current orchestration state snapshot for a session: all agents that were spawned, their roles, status, and last job result.

**Query parameters:**

| Parameter  | Default     | Description                  |
| ---------- | ----------- | ---------------------------- |
| `tenantId` | `"default"` | Tenant that owns the session |

**Response:**

```json
{
  "agents": [
    {
      "agentId": "adder-1",
      "displayName": "Adder1",
      "status": "closed",
      "role": "...",
      "createdAt": "2026-04-09T05:35:20.000Z",
      "closedAt": "2026-04-09T05:36:11.000Z",
      "events": 1
    }
  ]
}
```

---

### `GET /sessions/:sessionId/messages`

Returns the raw message history for a session. Used by the Context Diff view in the Inspector UI to display the full LLM conversation.

**Query parameters:**

| Parameter  | Default     | Description                  |
| ---------- | ----------- | ---------------------------- |
| `tenantId` | `"default"` | Tenant that owns the session |

**Response:**

```json
{
  "messages": [
    /* Anthropic-format Message objects */
  ]
}
```

---

### `GET /health`

Lightweight liveness check. Always returns 200 while the process is alive.

**Response:**

```json
{ "status": "ok" }
```

## Security

The Inspector API has no built-in authentication. It exposes **all session data** including full message history and tool outputs.

- Deploy inside a private network or behind an authenticated reverse proxy.
- Do not expose `/__inspector` publicly. Restrict it at the network or app layer.

## Advanced: mounting the Inspector manually

If you are not using `createAgentApp`, mount the route directly via the advanced API:

```ts
import { createInspectorRoute, createFilesystemInspectorDataSource } from "@agentrail/app/advanced";
import { Hono } from "hono";

const app = new Hono();

// Filesystem backend
app.route("/__inspector", createInspectorRoute(createFilesystemInspectorDataSource("./data")));

// Or a custom backend
import { PostgresInspectorDataSource } from "@agentrail/storage-postgres";
app.route("/__inspector", createInspectorRoute(new PostgresInspectorDataSource(sql)));
```

## Implementing a custom `InspectorDataSource`

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

Import the full interface type from `@agentrail/app/advanced`.
