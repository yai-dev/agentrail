# playground-server

The full Agentrail reference server. Powers the companion [`playground-ui`](../playground-ui/README.md).

It demonstrates the complete feature set of Agentrail in a single server:

- Multi-turn streaming and blocking chat
- Session management and context compaction
- Deep Research multi-agent workflow
- Orchestration (spawn sub-agents)
- Knowledge base ingestion and search
- Slash commands
- User memory consolidation
- Inspector API (`/__inspector`)
- Sandbox (Docker-based) filesystem tools

## Run

```bash
pnpm --filter @agentrail/playground-server dev
```

Configuration is read from `config/agentrail.yaml` at the repository root.

## Endpoints

| Method     | Path              | Description                                             |
| ---------- | ----------------- | ------------------------------------------------------- |
| `POST`     | `/api/chat`       | Blocking chat                                           |
| `POST`     | `/api/stream`     | Streaming chat (SSE)                                    |
| `POST`     | `/api/commands`   | Slash commands                                          |
| `GET/POST` | `/api/sessions/*` | Session management, orchestration, Deep Research, trace |
| `POST`     | `/api/knowledge`  | Knowledge base ingestion                                |
| `GET`      | `/health`         | Liveness check                                          |
| `GET`      | `/__inspector`    | Inspector API                                           |
