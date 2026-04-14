# with-custom-plugins

Demonstrates how to build a custom `AgentrailPlugin` that **intercepts and augments** requests, as opposed to the purely observational hooks shown in `with-custom-hooks`.

The `capability-plugin` demonstrates three plugin capabilities:

| Feature              | Method                 | What it does                                                                 |
| -------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| Lifecycle            | `start` / `stop`       | Logs when the server starts and shuts down                                   |
| Request interception | `interceptChatRequest` | If the message is exactly `"ping"`, returns `"pong"` without calling the LLM |
| Context injection    | `contextProviders`     | Prepends the current UTC timestamp to every request's context                |

## Run

```bash
cp .env.example .env  # fill in your API key
pnpm --filter @agentrail/with-custom-plugins-example dev
```

## Try it out

**Ping intercept** (no LLM call):

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "ping", "sessionId": null}'
# → {"text":"pong","stopReason":"intercepted",...}
```

**Normal message** (context provider injects timestamp):

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What time is it right now?", "sessionId": null}'
```

The agent can answer from the injected context, without needing a time tool.

## How it works

```ts
createAgentApp({
  plugins: [createCapabilityPlugin()],
  ...
});

// Plugin lifecycle must be managed by the caller:
void runPluginLifecycle(plugins, "start");

process.on("SIGINT", async () => {
  await runPluginLifecycle(plugins, "stop");
  process.exit(0);
});
```

## Key files

| File            | Purpose                                                                      |
| --------------- | ---------------------------------------------------------------------------- |
| `src/main.ts`   | Entry point — manages plugin lifecycle                                       |
| `src/plugin.ts` | `AgentrailPlugin` with `interceptChatRequest` and `contextProviders`         |
| `src/agent.ts`  | Profile with an `echo` tool (object params — required to trigger tool hooks) |
