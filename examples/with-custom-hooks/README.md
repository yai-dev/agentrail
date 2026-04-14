# with-custom-hooks

Demonstrates how to use `AgentrailPlugin` hook methods to **observe** request lifecycle events and tool calls without modifying or intercepting them.

The `observability-hooks` plugin logs:

- Request start / end with elapsed time
- Every tool call with its name and input arguments
- Tool result duration

Because the app layer only dispatches `onBeforeToolCall` when the tool's input is a plain object, the example includes an `echo` tool with `{ message: string }` parameters to reliably trigger these hooks.

## Run

```bash
cp .env.example .env  # fill in your API key
pnpm --filter @agentrail/with-custom-hooks-example dev
```

## Trigger a tool call

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Please echo the message: hello hooks", "sessionId": null}'
```

You will see output like:

```
[hooks] → request start  agent=hooks-agent session=<id> kind=chat
[hooks]   tool call      name=echo input={"message":"hello hooks"}
[hooks]   tool result    name=echo durationMs=1
[hooks] ← request end    agent=hooks-agent session=<id> elapsed=1234ms
```

## Key files

| File            | Purpose                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `src/main.ts`   | Entry point                                                                                       |
| `src/plugin.ts` | `AgentrailPlugin` with hook methods (`onRequestStart/End`, `onBeforeToolCall`, `onAfterToolCall`) |
| `src/agent.ts`  | Profile and `echo` tool                                                                           |
