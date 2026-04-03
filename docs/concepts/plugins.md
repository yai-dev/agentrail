# Plugins

Plugins extend the host layer with cross-cutting behavior that does not belong in profiles, routes, or runtime tools.

## What a Plugin Is

A plugin is a lightweight object that implements the `AgentrailPlugin` interface from `@agentrail/host`. It can hook into:

- the process lifecycle (startup and shutdown)
- individual request lifecycles (start, end, turn persisted)
- chat request interception (to handle slash commands or special input)
- context injection (to add request-time messages)
- attachment handling (to process uploaded files)

Plugins run across all profiles and routes. If a concern should exist regardless of which profile is active, it probably belongs in a plugin.

## The Mental Model

> Would this concern still exist if the app had multiple profiles and routes?

If yes, it belongs in a plugin. If it is specific to one profile's identity or one route's behavior, it belongs in a profile or route instead.

## Plugin Contract

```ts
interface AgentrailPlugin {
  name: string;

  // Process lifecycle
  start?(): Promise<void>;
  stop?(): Promise<void>;

  // Chat interception
  interceptChatRequest?(
    request: AgentrailChatRequest,
    context: AgentrailRequestLifecycleContext,
  ): Promise<AgentrailChatResponse | null>;

  // Request lifecycle
  onRequestStart?(context: AgentrailRequestLifecycleContext): Promise<void>;
  onRequestEnd?(context: AgentrailRequestLifecycleContext): Promise<void>;
  onTurnPersisted?(context: AgentrailRequestLifecycleContext): Promise<void>;

  // Context injection
  contextProviders?: ContextProvider[];

  // Attachment handling
  attachmentHandler?(
    attachments: Attachment[],
    context: AgentrailRequestLifecycleContext,
  ): Promise<string>;
}
```

## Hook Reference

### `name`

A stable, unique identifier for the plugin. Used in diagnostic logs and plugin assembly.

### `start` / `stop`

Process-level lifecycle hooks. Use them to bootstrap and tear down plugin-owned services:

```ts
{
  name: "activity-tracker",
  async start() {
    await activityDb.connect();
  },
  async stop() {
    await activityDb.disconnect();
  },
}
```

### `interceptChatRequest`

Runs before the host hands the request to a profile. If the plugin returns a response, the normal profile execution is skipped entirely.

Use it for:

- slash commands (`/summarize`, `/reset`, `/help`)
- admin-only request handling
- pre-flight validation that should block the agent

```ts
{
  name: "slash-commands",
  async interceptChatRequest(request, context) {
    if (typeof request.message === "string" && request.message.startsWith("/reset")) {
      await sessionStore.clear(context.sessionId);
      return { sessionId: context.sessionId, message: "Session cleared." };
    }
    return null; // pass through to normal execution
  },
}
```

Only the first plugin that returns a non-null response wins. Remaining plugins are not called for that request.

### `onRequestStart`

Runs at the start of every chat or stream request, before profile resolution. Use it for:

- foreground activity markers
- request-scoped initialization
- liveness tracking

### `onRequestEnd`

Runs after the full request lifecycle completes. Use it for:

- cleanup of request-scoped state
- logging or metrics

### `onTurnPersisted`

Runs after the host has persisted the turn to the session store. This is the safest place for behaviors that depend on the conversation state being durable — for example, updating a user memory index.

### `contextProviders`

A list of `ContextProvider` functions contributed by the plugin. These are merged with the profile's own context providers and run on every request.

### `attachmentHandler`

Called when a request includes uploaded files. Returns a string of context text that is injected into the request. Multiple plugins' attachment outputs are concatenated.

```ts
{
  name: "attachment-hints",
  async attachmentHandler(attachments) {
    const names = attachments.map((a) => a.filename).join(", ");
    return `Uploaded files: ${names}`;
  },
}
```

## Lifecycle Context

All request hooks receive an `AgentrailRequestLifecycleContext`:

```ts
{
  kind: "chat" | "stream";
  tenantId: string;
  userId: string;
  sessionId: string;
  agentId: string;
}
```

This is intentionally narrow — plugins should not need to understand the full request body shape.

## Execution Model

- Plugins are registered in an array and run in registration order
- `onRequestStart`, `onRequestEnd`, `onTurnPersisted` are awaited sequentially
- `interceptChatRequest` stops at the first plugin that returns a non-null response
- `attachmentHandler` results are concatenated across all plugins
- `contextProviders` from all plugins are merged with the profile's providers

## What Belongs in a Plugin vs Other Layers

| Concern                          | Belongs in                      |
| -------------------------------- | ------------------------------- |
| Slash command handling           | Plugin (`interceptChatRequest`) |
| User memory update after turn    | Plugin (`onTurnPersisted`)      |
| Request-scoped activity tracking | Plugin (`onRequestStart`)       |
| Uploaded file metadata hints     | Plugin (`attachmentHandler`)    |
| Domain-specific reasoning        | Tool                            |
| System prompt identity           | Profile                         |
| Route-level request handling     | Route                           |
| Multi-agent workflow logic       | Orchestration                   |

## Related Concepts

- [Host](host.md)
- [Profiles](profiles.md)
- [Context & Compaction](context-and-compaction.md)

## Related Reference

- [Plugin Contract Reference](../reference/plugin-contract.md)
- [Write a Plugin Guide](../guides/write-a-plugin.md)
