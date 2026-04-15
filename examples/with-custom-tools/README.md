# with-custom-tools

Demonstrates how to define custom tools and attach them to an agent profile.

Two tools are defined:

| Tool               | API                           | Description                                           |
| ------------------ | ----------------------------- | ----------------------------------------------------- |
| `get-current-time` | `defineSimpleTool`            | No parameters — returns the current UTC time          |
| `calculate`        | `defineTool` + TypeBox schema | Takes `{ expression: string }` — evaluates arithmetic |

`defineSimpleTool` is used for tools with no parameters. `defineTool` is used when you need a typed schema for the tool's input.

## Run

```bash
cp .env.example .env  # fill in your API key
pnpm --filter @agentrail/with-custom-tools-example dev
```

## Try it out

```bash
# Time tool (no parameters)
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What time is it right now?", "sessionId": null}'

# Calculate tool (typed parameters)
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is 123 * 456?", "sessionId": null}'
```

## Key files

| File           | Purpose                                                    |
| -------------- | ---------------------------------------------------------- |
| `src/tools.ts` | Tool definitions using `defineSimpleTool` and `defineTool` |
| `src/agent.ts` | Profile wiring tools into the agent                        |
| `src/main.ts`  | Entry point                                                |
