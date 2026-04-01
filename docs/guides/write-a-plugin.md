# Write a Plugin

Plugins are the recommended way to add cross-cutting host behavior that spans multiple profiles or routes.

## Prerequisites

Read this guide after:

- [Quickstart](quickstart.md)
- [Concepts: Plugins](../concepts/plugins.md)

## When To Use a Plugin

Use a plugin when the behavior:

- applies to multiple profiles or routes (e.g. request logging)
- needs lifecycle hooks (startup, shutdown)
- intercepts requests before the agent runs (e.g. slash commands)
- injects context that is not profile-specific

If the behavior is agent-specific reasoning, put it in a tool or prompt instead.

## The Plugin Contract

A plugin implements the `AgentrailPlugin` interface from `@agentrail/host`:

```ts
import type { AgentrailPlugin } from "@agentrail/host";
```

All fields except `name` are optional. Implement only the hooks you need.

## Minimal Example: Request Logger

```ts
import type { AgentrailPlugin } from "@agentrail/host";

export const requestLoggerPlugin: AgentrailPlugin = {
  name: "request-logger",

  onRequestStart(context) {
    console.log(
      `[${context.kind}] ${context.agentId} — user=${context.userId} session=${context.sessionId}`,
    );
  },

  onRequestEnd(context) {
    console.log(`[${context.kind}] ${context.agentId} — done`);
  },
};
```

## Intercepting Chat Requests

Use `interceptChatRequest` to short-circuit or handle a request before the normal agent flow runs. Return a response object to handle it, or `null` to pass through:

```ts
export const maintenanceModePlugin: AgentrailPlugin = {
  name: "maintenance-mode",

  async interceptChatRequest(context) {
    if (context.request.message.startsWith("/ping")) {
      return {
        status: 200,
        body: { message: "pong", sessionId: null },
      };
    }
    return null;
  },
};
```

The first plugin that returns a non-null result wins. Subsequent plugins are not called.

## Adding Context Providers

Use `contextProviders` to inject messages into every request's context window:

```ts
export const timezonePlugin: AgentrailPlugin = {
  name: "timezone-context",

  contextProviders: [
    async (context, _messages) => {
      return [
        {
          role: "user" as const,
          content: `Current server time: ${new Date().toISOString()}`,
          timestamp: Date.now(),
        },
      ];
    },
  ],
};
```

Context provider messages are prepended before the conversation history.

## Lifecycle Hooks

Use `start` and `stop` for background services tied to the host process:

```ts
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

export const heartbeatPlugin: AgentrailPlugin = {
  name: "heartbeat",

  start() {
    heartbeatTimer = setInterval(() => {
      console.log("heartbeat", new Date().toISOString());
    }, 60_000);
  },

  stop() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  },
};
```

## Registering Plugins

Pass your plugins to the host when assembling the server:

```ts
import { createChatRoute } from "@agentrail/host";

app.route(
  "/chat",
  createChatRoute({
    defaultAgentId: "default",
    sessionStore,
    resolveProfile,
    plugins: [requestLoggerPlugin, timezonePlugin],
  }),
);
```

## Execution Order

- Plugins run in registration order.
- Lifecycle hooks (`onRequestStart`, `onRequestEnd`, `onTurnPersisted`) are awaited sequentially.
- Chat interceptors stop at the first plugin that returns a handled response.
- Context providers from all plugins are merged.

## What Does Not Belong in a Plugin

- Domain-specific reasoning → use a tool
- System prompt identity → put it in the profile prompt
- Route composition → belongs in app startup
- Heavy workflow orchestration → use a dedicated workflow package

## Related Docs

- [Plugin Contract Reference](../reference/plugin-contract.md)
- [Build a Profile](build-a-profile.md)
- [Host Primitives Reference](../reference/host-primitives.md)
