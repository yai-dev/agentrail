# `createAgentApp` Reference

`createAgentApp` is the primary entry point for building an Agentrail-powered HTTP server. It returns a fully configured [Hono](https://hono.dev) application with `/chat`, `/stream`, and optional observability routes already wired up.

## Import

```ts
import { createAgentApp } from "@agentrail/app";
```

## Minimal example

```ts
import { createAgentApp, defineProfile } from "@agentrail/app";

const myProfile = defineProfile({
  /* ... */
});

const app = createAgentApp({
  dataDir: "./data",
  profiles: [myProfile],
  summarize: async (messages) => callLLMSummarizer(messages),
});

export default app;
```

## Mounted routes

| Method | Path             | Description                                                          |
| ------ | ---------------- | -------------------------------------------------------------------- |
| `POST` | `/chat`          | Non-streaming agent invocation                                       |
| `POST` | `/stream`        | Streaming agent invocation (SSE)                                     |
| `GET`  | `/health`        | Liveness probe _(unless `health.disableBuiltinHealthRoutes` is set)_ |
| `GET`  | `/ready`         | Readiness probe _(same condition)_                                   |
| `GET`  | `/__inspector/*` | Inspector API _(only when `inspector: true`)_                        |

---

## Options reference

### `dataDir`

```ts
dataDir?: string
```

Path to the directory used for persistent session and trace storage. The filesystem layout under this directory is managed by `SessionManager` and `createFileTelemetrySink`.

Required when `sessionStore` is not provided. Required when `inspector: true` is set.

---

### `sessionStore`

```ts
sessionStore?: AgentrailSessionStore
```

Custom session store implementation. When provided, `dataDir` is ignored for session storage. Use this to plug in a database-backed or in-memory store.

See [Session Store Reference](/reference/session-store) for the full interface and a worked example.

---

### `profiles`

```ts
profiles?: ProfileDefinition[]
```

Static list of agent profiles available to the app. The first entry is used as the default when a request omits `agentId`. At least one of `profiles` or `resolveProfile` must be provided.

See [Build a Profile](/guides/build-a-profile) for how to define profiles.

---

### `resolveProfile`

```ts
resolveProfile?: ProfileResolver
```

A function that dynamically resolves a profile for each request. Useful for tenant-aware routing, feature flags, or A/B testing. When provided, `profiles` is only consulted to determine `defaultAgentId`.

```ts
const app = createAgentApp({
  dataDir: "./data",
  resolveProfile: async ({ agentId, tenantId }) => {
    return await loadProfileForTenant(agentId, tenantId);
  },
  defaultAgentId: "default",
});
```

---

### `defaultAgentId`

```ts
defaultAgentId?: string
```

Profile ID used when a request body omits `agentId`. Falls back to the first entry in `profiles` when not set.

---

### `summarize`

```ts
summarize?: (
  messages: Message[],
  ctx?: { reason: "session_compaction" | "reactive_micro" | "reactive_full" },
) => Promise<string>
```

Summarizer function called by the compaction system when context grows beyond `compaction.triggerTokens`. Should call an LLM and return a condensed string.

When omitted, a no-op fallback concatenates message content without summarizing — agents may lose context rather than receive a proper recap. Always provide a real summarizer for production use.

---

### `compaction`

```ts
compaction?: {
  triggerTokens: number;
  minMessages: number;
  reactive?: {
    enabled?: boolean;
    microTriggerPct?: number;
    fullTriggerPct?: number;
    preserveRecentApiRounds?: number;
    microBatchGroups?: number;
    maxReactiveCompactionsPerRequest?: number;
  };
}
```

Thresholds for automatic context compaction. Defaults to `{ triggerTokens: 150_000, minMessages: 20 }`.

`compaction.reactive` controls in-loop reactive compaction for long-running turns. `microTriggerPct` starts local API-round summarization, `fullTriggerPct` triggers a more aggressive in-memory summary, and `maxReactiveCompactionsPerRequest` limits retries after prompt-too-long failures.

See [Context & Compaction](/concepts/context-and-compaction) for how compaction works.

---

### `plugins`

```ts
plugins?: AgentrailPlugin[]
```

App-level plugins for request interception and lifecycle hooks. Plugins run in order for each request.

See [Write a Plugin](/guides/write-a-plugin) and [Plugin Contract](/reference/plugin-contract).

---

### `onPluginError`

```ts
onPluginError?: PluginErrorHandler
```

Called when a plugin hook throws. Defaults to `console.warn`. Plugin errors are isolated — a failing plugin never aborts the request pipeline.

---

### `contextProviders`

```ts
contextProviders?: ContextProvider[]
```

Static context providers prepended to every request regardless of profile. Use this for app-wide context such as current date or system configuration.

---

### `sandboxManager`

```ts
sandboxManager?: SandboxManager
```

Sandbox manager for upload handling and workspace snapshots in the `/stream` route. When omitted, the route is still mounted but file-upload and workspace-snapshot features are disabled.

---

### `traceStoreFactory`

```ts
traceStoreFactory?: (sessionRef: SessionRef) => SessionTraceStore<WorkflowTraceEventEnvelope>
```

Factory that creates a session-scoped trace store for each request. Trace envelopes (agent loop events, tool calls, compaction events) are written via `store.appendEnvelope(envelope)`.

When omitted and `dataDir` is set, `createAgentApp` falls back to the default filesystem-backed `createFileSystemSessionTraceStore`. When neither is provided, traces are not persisted (but still forwarded to `telemetrySink` if one is configured).

```ts
import { createAgentApp, createFileSystemSessionTraceStore } from "@agentrail/app";
import { PostgresSessionTraceStore } from "@agentrail/storage-postgres";

// PostgreSQL example
const app = createAgentApp({
  sessionStore: new PostgresSessionStore(sql),
  profiles: [myProfile],
  traceStoreFactory: (sessionRef) => new PostgresSessionTraceStore(sql, sessionRef),
});
```

---

### `createOrchestrationPersistence`

```ts
createOrchestrationPersistence?: (sessionRef: SessionRef) => OrchestrationPersistence
```

Factory that creates an `OrchestrationPersistence` for each session. When provided (and `orchestrationRegistry` is not), `createAgentApp` automatically builds an `AgentrailOrchestrationRegistry` backed by this factory. This is the recommended shorthand for hosts that only need to swap the storage backend.

```ts
import { createAgentApp } from "@agentrail/app";
import { PostgresOrchestrationPersistence, createSqlClient } from "@agentrail/storage-postgres";

const sql = createSqlClient({ connectionString: process.env.DATABASE_URL! });

const app = createAgentApp({
  sessionStore: new PostgresSessionStore(sql),
  profiles: [myProfile],
  createOrchestrationPersistence: (sessionRef) =>
    new PostgresOrchestrationPersistence(sql, sessionRef),
});
```

When omitted, orchestration SSE events are not forwarded unless an explicit `orchestrationRegistry` is passed.

---

### `orchestrationRegistry`

```ts
orchestrationRegistry?: AgentrailOrchestrationRegistry
```

Explicit registry instance used by the `/stream` route to subscribe to sub-agent events for real-time SSE forwarding. Pass the same registry instance you used when wiring up `orchestration(registry, factory)` inside your profile.

Use `orchestrationRegistry` when you need direct control over the registry (e.g. to call `invalidate()` or share it with other parts of the server). For simpler setups, use `createOrchestrationPersistence` instead and let `createAgentApp` build the registry.

When neither is provided, orchestration SSE events are not forwarded to the client.

---

### `inspector`

```ts
inspector?: true | InspectorDataSource
```

Mounts the read-only Inspector API at `/__inspector`, consumed by the [Agentrail Inspector](https://github.com/yai-dev/agentrail-inspector) Docker image.

Three variants:

- **`true`** — automatically creates a filesystem data source from `dataDir`. **Requires `dataDir`** and is incompatible with a custom `sessionStore`. An error is thrown at startup if either constraint is violated.
- **`InspectorDataSource`** — use a custom data source (e.g. a PostgreSQL backend). Works with any `sessionStore` configuration.

```ts
// Filesystem backend (default)
createAgentApp({ dataDir: "./data", profiles: [...], inspector: true });

// Custom backend
import { PostgresInspectorDataSource } from "@agentrail/storage-postgres";
createAgentApp({
  sessionStore: new PostgresSessionStore(sql),
  profiles: [...],
  inspector: new PostgresInspectorDataSource(sql),
});
```

See [Inspector Route Reference](/reference/inspector-route).

---

### `health`

```ts
health?: {
  readinessChecks?: ReadinessCheck[];
  disableBuiltinHealthRoutes?: boolean;
}
```

Health route configuration. By default `createAgentApp` mounts `GET /health` and `GET /ready`. Both endpoints are compatible with Kubernetes liveness and readiness probes.

- **`readinessChecks`** — additional checks run alongside the built-in session store check. Use this to verify API keys or external services at startup:

  ```ts
  const app = createAgentApp({
    dataDir: "./data",
    profiles: [myProfile],
    health: {
      readinessChecks: [
        async () => {
          const ok = await pingExternalService();
          return { name: "external-service", status: ok ? "ok" : "fail" };
        },
      ],
    },
  });
  ```

- **`disableBuiltinHealthRoutes`** — set to `true` to skip mounting `/health` and `/ready` entirely. Useful when the host application manages health routes itself.

---

### `permissionPolicy`

```ts
permissionPolicy?: ToolPermissionPolicy
```

Optional permission policy applied to all sessions served by this app.

When set, tools evaluate the policy via their `checkPermissions` hook before executing.
The policy is forwarded through `AgentrailProfileContext.permissionPolicy` →
`CapabilityBuildContext.permissionPolicy` into each capability's tool set.

```ts
import { parseRules } from "@agentrail/capabilities";

const app = createAgentApp({
  dataDir: "./data",
  profiles: [myProfile],
  permissionPolicy: {
    mode: "default",
    // Bash rules use "verb:args" DSL — "git:*" matches any git command
    allow: parseRules(["Bash(git:*)", "Bash(npm:*)"]),
    deny: parseRules(["Bash(rm:*)"]),
    ask: parseRules(["Write", "Edit"]),
  },
});
```

The Bash DSL uses a `verb:args` form: `"git:*"` matches any command whose first word is `git`
(e.g. `git status`, `git log --oneline`, `git add src/main.ts`). The tool normalises
`"git status"` → `"git:status"` before pattern matching. The `*` wildcard in Bash patterns
matches across `/` so path arguments in commands are matched correctly.

**Permission modes:**

| `mode`                | Default outcome | Description                                                                                                                             |
| --------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `"default"`           | `allow`         | Opt-in deny/ask. Only rules explicitly listed in `deny`/`ask` block tool calls.                                                         |
| `"strict"`            | `deny`          | Deny-by-default. Only operations listed in `allow` are permitted; everything else is blocked. Use for minimal-privilege configurations. |
| `"acceptEdits"`       | `allow`         | Like `default`, but `ask` decisions for `Write`/`Edit` tools are auto-approved.                                                         |
| `"dontAsk"`           | `allow`         | Like `default`, but `ask` decisions are demoted to `deny` (headless environments).                                                      |
| `"bypassPermissions"` | `allow`         | All checks skipped (trusted automation only).                                                                                           |

**Strict (deny-by-default) allowlist example:**

```ts
import { parseRules } from "@agentrail/capabilities";

const app = createAgentApp({
  permissionPolicy: {
    mode: "strict", // deny anything not explicitly allowed
    allow: parseRules([
      "Bash(git:*)", // prefix-match: any content starting with "git:"
      "Bash(npm:*)", // prefix-match: any content starting with "npm:"
      "Read", // permit all file reads
    ]),
    deny: [],
    ask: [],
  },
});
```

> **Bash rule caveat:** Bash patterns are **prefix-anchored** (no trailing
> `$`). `Bash(git:*)` matches any normalised command whose first word is
> `git`, but it also matches shell strings that merely _start_ with `git:`
> — including chained forms like `git:status; curl evil.com`. Bash rules
> are useful for coarse-grained allow/deny (e.g. block all `rm` calls), but
> they cannot provide strict command confinement. For strong shell
> isolation, run agents in the sandboxed environment.

**Loading from `agentrail.yaml`:**

When `config.permissions` is set, use `configPermissionsToPolicy` to convert the raw YAML config
into a runtime `ToolPermissionPolicy`:

```ts
import { createAgentApp, loadAgentrailConfig, configPermissionsToPolicy } from "@agentrail/app";

const config = loadAgentrailConfig();
const app = createAgentApp({
  dataDir: "./data",
  profiles: [myProfile],
  permissionPolicy: config.permissions ? configPermissionsToPolicy(config.permissions) : undefined,
});
```

See the [Tool Permissions Guide](/guides/tool-permissions) for the full DSL reference, mode descriptions, and interactive approval wiring.

---

### `telemetrySink`

```ts
telemetrySink?: TelemetrySink
```

Pluggable sink that receives structured `TelemetrySinkEvent` objects from both the `/chat` and `/stream` routes. Use this to forward events to OpenTelemetry, Datadog, or a custom backend.

Built-in sinks shipped with `@agentrail/app`:

- `createConsoleTelemetrySink()` — pretty-prints events to stdout; for local development only.
- `createFileTelemetrySink(dataDir)` — appends events as JSONL trace files under `dataDir`; used by the Inspector.

See [Telemetry Sink Reference](/reference/telemetry-sink).

---

## Return value

Returns a `Hono` instance. Mount it in any Node.js HTTP server:

```ts
import { serve } from "@hono/node-server";
import { createAgentApp } from "@agentrail/app";

const app = createAgentApp({
  /* ... */
});
serve({ fetch: app.fetch, port: 3000 });
```

Or export it for use with Bun, Cloudflare Workers, or any other runtime that accepts a `fetch`-compatible handler.
