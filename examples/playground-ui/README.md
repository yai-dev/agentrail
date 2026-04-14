# playground-ui

The React/Vite companion frontend for [`playground-server`](../playground-server/README.md).

## Run

Start the backend first, then start the UI in a separate terminal:

```bash
# Terminal 1 — backend
pnpm --filter @agentrail/playground-server dev

# Terminal 2 — frontend
pnpm --filter @agentrail/playground-ui dev
```

The UI proxies `/api` and `/health` requests to the backend automatically via the Vite dev server config.

## Features

- Streaming chat with session management
- Deep Research workflow UI
- Orchestration (sub-agent) trace viewer
- Permission / wait-for-user-input prompts
- Markdown and Mermaid diagram rendering
- File attachment support
