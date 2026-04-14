# pg-backend-agent-server

Demonstrates how to swap the default filesystem storage for a **PostgreSQL** backend using `@agentrail/storage-postgres`.

All session messages and workflow traces are persisted in Postgres, making the server horizontally scalable and suitable for production deployments.

## Prerequisites

A running PostgreSQL instance. The quickest way to start one locally:

```bash
docker run --rm -p 5432:5432 \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=agentrail \
  postgres:16
```

## Run

```bash
cp .env.example .env  # fill in DATABASE_URL and your API key
pnpm --filter @agentrail/pg-backend-agent-server-example dev
```

The storage tables are created automatically on first start via `@agentrail/storage-postgres`.

## How it works

```ts
const sql = createSqlClient({ connectionString: process.env.DATABASE_URL });

createAgentApp({
  sessionStore: new PostgresSessionStore(sql),
  traceStoreFactory: createPostgresSessionTraceStore(sql),
  // dataDir is omitted — all persistence goes to Postgres
  ...
});
```

`createPostgresSessionTraceStore(sql)` already returns a `(sessionRef) => SessionTraceStore` factory, so it can be passed directly to `traceStoreFactory`.

## Endpoints

| Method | Path      | Description          |
| ------ | --------- | -------------------- |
| `POST` | `/chat`   | Blocking chat        |
| `POST` | `/stream` | Streaming chat (SSE) |
| `GET`  | `/health` | Liveness check       |

## Key files

| File           | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `src/main.ts`  | Entry point — creates the SQL client and wires Postgres stores |
| `src/agent.ts` | Agent definition and profile                                   |
