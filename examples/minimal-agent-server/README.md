# minimal-agent-server

The simplest possible Agentrail server: a single agent profile wired into `createAgentApp` and served over HTTP.

## Run

```bash
cp .env.example .env  # fill in your API key
pnpm --filter @agentrail/minimal-agent-server-example dev
```

The server starts on `http://localhost:3000` (or `$PORT`).

## Endpoints

| Method | Path      | Description                               |
| ------ | --------- | ----------------------------------------- |
| `POST` | `/chat`   | Blocking chat — returns the full response |
| `POST` | `/stream` | Streaming chat — Server-Sent Events       |
| `GET`  | `/health` | Liveness check                            |

## Chat example

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!", "sessionId": null}'
```

## Key files

| File           | Purpose                                                |
| -------------- | ------------------------------------------------------ |
| `src/main.ts`  | Entry point — wires the app and starts the HTTP server |
| `src/agent.ts` | Agent definition, profile, and summarizer              |
