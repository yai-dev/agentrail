# Plugin Contract Reference

Plugins extend host behavior through a compact lifecycle contract.

## When To Read This Page

Read this page when:

- you are deciding whether a concern belongs in a plugin
- you need to understand the current plugin lifecycle hooks
- you want to extend host behavior without bloating routes or profiles

They exist to hold cross-cutting host behavior that should not live in:

- runtime tools
- hosted profiles
- route files

## Mental Model

A plugin is a lightweight host extension.

It is the right place for behavior such as:

- request interception
- request lifecycle side effects
- extra context providers
- attachment-derived context injection
- background services tied to host startup/shutdown

It is not the right place for core agent reasoning behavior. That belongs in prompts, tools, workflows, or profiles.

## Main Capabilities

The current plugin contract is defined by `AgentrailPlugin` in:

- [packages/app/src/host/types.ts](../../packages/app/src/host/types.ts)

### `AgentrailPlugin` interface

```ts
interface AgentrailPlugin {
  /** Stable identifier used in diagnostics and assembly logs */
  name: string;
  /** Semantic version string (e.g. `"1.0.0"`) — recommended for diagnostics */
  version?: string;
  /**
   * Execution order relative to other plugins.
   * Higher values run first during start() and all request-time hooks.
   * stop() runs in reverse order (lowest priority first).
   * Defaults to 0.
   */
  priority?: number;
  /**
   * When true, an error thrown by interceptChatRequest propagates and aborts
   * the request (after being reported to onPluginError).
   * Use for auth/rate-limit plugins where a throw means "deny this request".
   * Defaults to false.
   */
  critical?: boolean;
  /** Runs when the host starts the plugin lifecycle */
  start?(): void | Promise<void>;
  /** Runs when the host shuts plugins down */
  stop?(): void | Promise<void>;
  /** Intercept a chat request before the host runs the normal profile flow */
  interceptChatRequest?(
    context: AgentrailChatRequestContext,
  ): Promise<AgentrailChatHandledResponse | null> | AgentrailChatHandledResponse | null;
  /** Static context providers contributed by this plugin */
  contextProviders?: ContextProvider[];
  /** Inspect uploaded files and return extra context text */
  attachmentHandler?: AttachmentHandler;
  /** Runs at the start of every chat or stream request */
  onRequestStart?(ctx: AgentrailRequestLifecycleContext): void | Promise<void>;
  /** Runs after the request lifecycle completes */
  onRequestEnd?(ctx: AgentrailRequestLifecycleContext): void | Promise<void>;
  /** Runs after the resulting turn has been persisted */
  onTurnPersisted?(ctx: AgentrailRequestLifecycleContext): void | Promise<void>;
}
```

### `AgentrailRequestLifecycleContext`

```ts
interface AgentrailRequestLifecycleContext {
  kind: "chat" | "stream";
  tenantId: string;
  userId: string;
  sessionId: string;
  agentId: string;
}
```

### `AttachmentHandler`

```ts
interface AttachmentFile {
  name: string;
  mimeType: string;
  containerPath: string;
  sizeKb: number;
}

interface AttachmentHandlerResult {
  contextText?: string;
}

type AttachmentHandler = (
  files: AttachmentFile[],
) => Promise<AttachmentHandlerResult | null> | AttachmentHandlerResult | null;
```

### `ContextProvider`

```ts
type ContextProvider = (
  context: { tenantId: string; userId: string; sessionId: string },
  messages: Message[],
) => Promise<Message[]> | Message[];
```

## Contract Surface

### `name`

A stable plugin identifier for diagnostics and assembly.

### `version`

Optional semantic version string (`MAJOR.MINOR.PATCH`) for the plugin implementation.
Providing a version is recommended — it appears in host diagnostic logs and makes it
easier to correlate issues across deployments.

### `priority`

Controls execution order relative to other plugins. Higher values run **first** during
`start()` and all request-time hooks. `stop()` runs in the **reverse** order (lowest
priority stops first), mirroring standard dependency teardown semantics.

Defaults to `0`. Plugins with equal priority run in registration order.

```ts
// Auth plugin must intercept before any feature plugin
const authPlugin: AgentrailPlugin = { name: "auth", priority: 100, ... };
const featurePlugin: AgentrailPlugin = { name: "feature", priority: 0, ... };
```

| Phase | Order | Rationale |
|-------|-------|-----------|
| `start()` | Descending (high first) | High-priority plugins may be dependencies of others |
| `stop()` | Ascending (low first) | Teardown mirrors initialisation |
| Request hooks | Descending (high first) | Auth/policy plugins run before feature plugins |
| Context providers | Descending (high first) | High-priority context is injected first |

### `critical`

When `true`, an error thrown by `interceptChatRequest` propagates and aborts the request
(after being reported to `onPluginError`).

Use this for auth, rate-limit, or policy plugins where a throw means "deny this request".
Non-critical plugin errors are isolated — the request continues as if the plugin returned
`null`.

Defaults to `false`.

### `start` / `stop`

Runs when the host starts or shuts down the plugin lifecycle.

Use `start` for:

- starting timers and background processes
- bootstrapping plugin-owned services

Use `stop` to clean up anything started in `start`.

### `interceptChatRequest`

Lets a plugin short-circuit or handle a chat request before the host continues with normal profile execution.

This is useful for:

- slash commands
- admin-only request handling
- special command parsing that does not belong in the main runtime agent

Returns `null` to let the request proceed normally, or a response body to short-circuit.

### `contextProviders`

Lets a plugin add provider-based context injection into the host request pipeline.

Use it for information that should be prepended as request context rather than executed as a tool.

### `attachmentHandler`

Lets a plugin inspect uploaded files and return extra context text.

This is the right place for behaviors such as:

- telling the agent which uploaded files exist
- adding file-type-specific usage hints
- lightweight attachment interpretation before runtime execution

### `onRequestStart`

Runs at the beginning of a chat or stream request lifecycle.

Typical uses:

- foreground activity tracking
- liveness markers
- request-scoped bookkeeping

### `onRequestEnd`

Runs after the host completes the request lifecycle.

### `onTurnPersisted`

Runs after the host has persisted the resulting turn.

Use it for behaviors that depend on the conversation state already being durable.

## Complete Example Plugin

A plugin that combines all hook types:

```ts
import type { AgentrailPlugin, ContextProvider } from "@agentrail/app";

// --- Context provider ---
const datestampProvider: ContextProvider = async (ctx, messages) => {
  return [
    {
      role: "user",
      content: `[System note: Today is ${new Date().toISOString().slice(0, 10)}. Tenant: ${
        ctx.tenantId
      }]`,
    },
    ...messages,
  ];
};

// --- Background heartbeat ---
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

// --- Full plugin ---
export const observabilityPlugin: AgentrailPlugin = {
  name: "observability",
  version: "1.0.0",
  priority: 10,

  start() {
    heartbeatTimer = setInterval(() => {
      console.log(JSON.stringify({ event: "heartbeat", ts: Date.now() }));
    }, 60_000);
  },

  stop() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  },

  // Intercept slash commands before normal agent execution
  interceptChatRequest(ctx) {
    if (ctx.request.message === "/ping") {
      return { status: 200, body: { text: "pong" } };
    }
    return null; // continue normally
  },

  // Inject a datestamp message before conversation history
  contextProviders: [datestampProvider],

  // Inject a hint about uploaded files
  attachmentHandler(files) {
    if (files.length === 0) return null;
    const list = files.map((f) => `- ${f.name} (${f.mimeType}, ${f.sizeKb} KB)`).join("\n");
    return { contextText: `Uploaded files:\n${list}` };
  },

  onRequestStart(ctx) {
    console.log(JSON.stringify({ event: "request_start", ...ctx }));
  },

  onRequestEnd(ctx) {
    console.log(JSON.stringify({ event: "request_end", ...ctx }));
  },

  onTurnPersisted(ctx) {
    console.log(JSON.stringify({ event: "turn_persisted", sessionId: ctx.sessionId }));
  },
};
```

Register in route assembly (high-level path):

```ts
import { createAgentApp } from "@agentrail/app";
import { observabilityPlugin } from "./plugins/observability.js";

const app = createAgentApp({
  dataDir: DATA_DIR,
  profiles: [defaultProfile],
  plugins: [observabilityPlugin],
});
```

Or, when using route primitives directly:

```ts
import { createStreamRoute } from "@agentrail/app/advanced";
import { observabilityPlugin } from "./plugins/observability.js";

app.route(
  "/api/stream",
  createStreamRoute({
    // ...
    plugins: [observabilityPlugin],
  }),
);
```

## Error Isolation

All plugin hooks are wrapped in per-plugin try/catch. An error from one plugin never
propagates to the calling request unless `critical: true` is set on that plugin.

### Error strategy per hook

| Hook | On error |
|------|----------|
| `start()` | Report to `onPluginError`, then rethrow (startup is aborted) |
| `stop()` | Report to `onPluginError`, continue (all plugins always get to stop) |
| `onRequestStart/End/onTurnPersisted` | Report, continue |
| `interceptChatRequest` (non-critical) | Report, skip plugin (treated as `null`) |
| `interceptChatRequest` (critical) | Report, rethrow (request is aborted) |
| `attachmentHandler` | Report, skip plugin result, merge others |

### `onPluginError` callback

To receive plugin errors in your own logging or tracing system, pass an `onPluginError`
callback to `createAgentApp()` and to `runPluginLifecycle()`:

```ts
import type { PluginErrorHandler } from "@agentrail/app";
import { createAgentApp, runPluginLifecycle } from "@agentrail/app";

const onPluginError: PluginErrorHandler = async ({ plugin, hook, error }) => {
  await myLogger.warn({ plugin, hook, err: error }, "plugin hook failed");
};

// Thread the same handler to lifecycle calls and createAgentApp
void runPluginLifecycle(plugins, "start", onPluginError);

const app = createAgentApp({
  // ...
  plugins,
  onPluginError,
});
```

The callback may be synchronous or asynchronous — the host `await`s its result before
deciding whether to continue or rethrow. If the callback itself throws, the host falls back
to `console.error`; the main request flow is never affected by callback instability.

When `onPluginError` is omitted, the default behavior is to log to `console.warn`.

## Execution Model

The current plugin runtime helpers live in:

- [packages/app/src/host/plugins.ts](../../packages/app/src/host/plugins.ts)

Important characteristics of the current model:

- plugins run in `priority` order (descending); equal-priority plugins run in registration order
- request hooks are awaited sequentially
- chat interceptors stop at the first plugin that returns a handled response
- attachment handlers are merged by concatenating returned context text
- every hook is error-isolated per plugin; a throwing plugin does not affect others

## Repository Examples

The playground example assembles plugins here:

- [examples/playground-server/src/plugins/index.ts](../../examples/playground-server/src/plugins/index.ts)

Current example plugins include:

- slash commands
- attachment hints
- user-memory integration

This is a useful reference because each plugin owns one horizontal concern instead of becoming a kitchen-sink extension.

## What Belongs In A Plugin

Good plugin use cases:

- slash command interception
- activity and liveness tracking
- adding request-scoped context providers
- attachment metadata hints
- lifecycle-managed background jobs

Bad plugin use cases:

- domain-specific reasoning that should be a tool
- system prompt identity that should live in a profile
- route composition that belongs in app startup
- heavy workflow orchestration that deserves its own package

## Design Intent

Plugins should own cross-cutting host behavior, not agent behavior that belongs inside runtime tools or profiles.

The test for plugin fit is simple:

> Would this concern still exist if the app had multiple profiles and routes?

If yes, it probably belongs in a plugin.

## Related Docs

- [Write a Plugin](../guides/write-a-plugin.md)
- [Profile Contract Reference](profile-contract.md)
- [Host Primitives Reference](host-primitives.md)
