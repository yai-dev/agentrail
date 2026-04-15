# multiple-profiles

Demonstrates how to register and select between multiple agent profiles in a single Agentrail server.

Three profiles are defined, each with a different system prompt and persona:

| Profile ID       | Name               | Persona                   |
| ---------------- | ------------------ | ------------------------- |
| `general-agent`  | General Assistant  | Friendly, general-purpose |
| `coding-agent`   | Coding Assistant   | Expert software engineer  |
| `research-agent` | Research Assistant | Thorough researcher       |

## Run

```bash
cp .env.example .env  # fill in your API key
pnpm --filter @agentrail/multiple-profiles-example dev
```

## Selecting a profile

Pass `agentId` in the request body to route to a specific profile. When omitted, the first registered profile (`general-agent`) is used.

```bash
# Use the coding assistant
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is a monad?", "agentId": "coding-agent", "sessionId": null}'

# Use the research assistant
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Summarise recent advances in quantum computing.", "agentId": "research-agent", "sessionId": null}'
```

## Endpoints

| Method | Path      | Description          |
| ------ | --------- | -------------------- |
| `POST` | `/chat`   | Blocking chat        |
| `POST` | `/stream` | Streaming chat (SSE) |
| `GET`  | `/health` | Liveness check       |

## Key files

| File                | Purpose                                       |
| ------------------- | --------------------------------------------- |
| `src/main.ts`       | Entry point                                   |
| `src/profiles.ts`   | Three profile definitions                     |
| `src/summarizer.ts` | Shared summarizer used for context compaction |
