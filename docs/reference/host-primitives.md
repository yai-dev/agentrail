# Host Primitives Reference

The host primitives expose the lower-level request orchestration layer, available from `@agentrail/app/advanced`.

## When To Read This Page

Read this page when:

- `createAgentApp` is no longer enough
- you need route-level or lifecycle-level control
- you want to understand the primitives that `createAgentApp` wraps

Use these when your application needs a custom request lifecycle or is integrating into an existing server architecture that cannot adopt `createAgentApp` directly.

## When To Use Host Primitives

Use the primitives directly when:

- your request lifecycle differs from the standard flow
- you need custom profile resolution rules not covered by `resolveProfile`
- you want to mix your own context pipeline with only part of the standard setup
- you need custom streaming or orchestration behavior
- you are integrating Agentrail into an existing server architecture

If you do **not** already know that you need one of those, start with `createAgentApp` from `@agentrail/app` first.

## Import Path

```ts
import { createChatRoute, createStreamRoute } from "@agentrail/app/advanced";
```

## Main APIs

- `createChatRoute`
- `createStreamRoute`
- `createOrchestrationRegistry`
- `composeTransformContexts`
- `createTransformContext`
- `createContextProviderFromTransform`
- `runPluginLifecycle`

## Route Factories

### `createChatRoute`

Defined in:

- [packages/app/src/routes/chat-route.ts](https://github.com/yai-dev/agentrail/blob/main/packages/app/src/routes/chat-route.ts)

This is the non-streaming host entry point.

It handles:

- request parsing and validation
- session resolution
- profile resolution
- context pipeline resolution
- plugin chat interception
- agent invocation
- turn persistence

Use it when your app needs request/response semantics without SSE.

#### `AgentrailChatRouteOptions`

```ts
interface AgentrailChatRouteOptions {
  /** Profile ID used when the request omits agentId */
  defaultAgentId: string;
  /** Session persistence implementation */
  sessionStore: AgentrailSessionStore;
  /** LLM call used to summarize old messages during compaction */
  summarize: (
    messages: Message[],
    ctx?: { reason: "session_compaction" | "reactive_micro" | "reactive_full" },
  ) => Promise<string>;
  /** Compaction trigger configuration */
  compaction: {
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
  };
  /** Resolve a profile by agentId for the current request */
  resolveProfile(
    agentId: string,
    context: {
      tenantId: string;
      userId: string;
      sessionId: string;
      sessionRef: SessionRef;
      sessionStore: AgentrailSessionStore;
    },
    onSubAgentEvent?: (event: object) => void,
  ): Promise<AgentrailProfile | null>;
  /** Registered plugins */
  plugins?: AgentrailPlugin[];
  /** Static context providers applied to every request */
  contextProviders?: ContextProvider[];
  /** Dynamic context providers built per request */
  getContextProviders?: (context: {
    tenantId: string;
    userId: string;
    sessionId: string;
  }) => Promise<ContextProvider[]> | ContextProvider[];
  /** Request-time message rewrite hook */
  getTransformContext?: (context: {
    tenantId: string;
    userId: string;
    sessionId: string;
  }) => Promise<TransformContextFn> | TransformContextFn;
  /** Intercept a resolved request before agent execution */
  handleResolvedRequest?: (
    context: AgentrailResolvedChatContext,
  ) => Promise<AgentrailChatHandledResponse | null> | AgentrailChatHandledResponse | null;
  onRequestStart?: (ctx: AgentrailRequestLifecycleContext) => void | Promise<void>;
  onRequestEnd?: (ctx: AgentrailRequestLifecycleContext) => void | Promise<void>;
  onTurnPersisted?: (ctx: AgentrailRequestLifecycleContext) => void | Promise<void>;
}
```

**Minimal example:**

```ts
import { createChatRoute } from "@agentrail/app/advanced";
import { SessionManager } from "@agentrail/app";
import { createStaticProfileResolver } from "@agentrail/app";

app.route(
  "/api/chat",
  createChatRoute({
    defaultAgentId: "default",
    sessionStore: new SessionManager(dataDir),
    summarize: async (messages) => {
      // call your LLM summarizer here
      return messages.map((m) => String("content" in m ? m.content : "")).join("\n");
    },
    compaction: { triggerTokens: 80_000, minMessages: 20 },
    resolveProfile: createStaticProfileResolver([defaultProfile]),
  }),
);
```

### `createStreamRoute`

Defined in:

- [packages/app/src/routes/stream-route.ts](https://github.com/yai-dev/agentrail/blob/main/packages/app/src/routes/stream-route.ts)

This is the streaming host entry point.

It adds stream-specific responsibilities on top of the basic host lifecycle:

- attachment persistence
- SSE event forwarding
- proactive compaction signaling
- optional orchestration event forwarding
- workspace-aware streaming behavior

Use it when you need:

- incremental runtime events
- compaction visibility
- orchestration visibility
- long-running tool feedback

#### `AgentrailStreamRouteOptions`

```ts
interface AgentrailStreamRouteOptions {
  /** Root data directory — used for attachment persistence */
  dataDir: string;
  defaultAgentId: string;
  sessionStore: AgentrailSessionStore;
  /** Required for sandbox-backed file attachment persistence */
  sandboxManager: SandboxManager;
  resolveProfile(
    agentId: string,
    context: {
      tenantId: string;
      userId: string;
      sessionId: string;
      sessionRef: SessionRef;
      sessionStore: AgentrailSessionStore;
    },
    onSubAgentEvent?: (event: object) => void,
  ): Promise<AgentrailProfile | null>;
  summarize(
    messages: Message[],
    ctx?: { reason: "session_compaction" | "reactive_micro" | "reactive_full" },
  ): Promise<string>;
  compaction: {
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
  };
  plugins?: AgentrailPlugin[];
  contextProviders?: ContextProvider[];
  getContextProviders?: (context: {
    tenantId: string;
    userId: string;
    sessionId: string;
  }) => Promise<ContextProvider[]> | ContextProvider[];
  /** Returns an OrchestrationManager for the session — enables orchestration events */
  getOrchestrationManager?: (context: {
    tenantId: string;
    userId: string;
    sessionId: string;
    sessionRef: SessionRef;
  }) => Promise<OrchestrationManager>;
  /** Intercept a resolved request before streaming begins */
  handleResolvedRequest?: (context: AgentrailResolvedStreamContext) => Promise<boolean> | boolean;
  /** Called for each trace-eligible SSE event — use for trace persistence */
  onTraceEvent?: (
    context: { tenantId: string; sessionId: string; sessionRef: SessionRef },
    envelope: WorkflowTraceEventEnvelope,
  ) => void;
}
```

**Minimal example:**

```ts
import { createStreamRoute } from "@agentrail/app/advanced";
import { SessionManager, createStaticProfileResolver } from "@agentrail/app";
import { SandboxManager } from "@agentrail/capabilities";

app.route(
  "/api/stream",
  createStreamRoute({
    dataDir,
    defaultAgentId: "default",
    sessionStore: new SessionManager(dataDir),
    sandboxManager: new SandboxManager(dataDir),
    resolveProfile: createStaticProfileResolver([defaultProfile]),
    summarize,
    compaction: { triggerTokens: 80_000, minMessages: 20 },
    plugins,
  }),
);
```

## Profile Resolution

### `createStaticProfileResolver`

Available from the main `@agentrail/app` entry point. Builds a simple resolver from a fixed list of profiles. Use this with `createChatRoute` / `createStreamRoute` when `createAgentApp` is not suitable.

```ts
import { createStaticProfileResolver } from "@agentrail/app";

const resolveProfile = createStaticProfileResolver([supportProfile, researchProfile]);
```

For policy-driven or tenant-driven routing, implement `ProfileResolver` directly:

```ts
import type { ProfileResolver } from "@agentrail/app";

const resolveProfile: ProfileResolver = async ({ agentId, tenantId }) => {
  return await loadProfileForTenant(agentId, tenantId);
};
```

Pass the result to `createChatRoute` / `createStreamRoute` as `resolveProfile`.

## Context Pipeline Helpers

### `composeTransformContexts`

Composes multiple rewrite transforms left-to-right before provider injection. Use this when different capabilities or host layers each need to rewrite history.

### `createTransformContext`

Defined in:

- [packages/app/src/host/context-pipeline.ts](https://github.com/yai-dev/agentrail/blob/main/packages/app/src/host/context-pipeline.ts)

Converts an ordered list of `ContextProvider`s into the runtime `transformContext` function shape. It can also accept a base rewrite transform; in that case, providers run against the rewritten history and their messages are prepended afterward.

### `createContextProviderFromTransform`

Also defined in:

- [packages/app/src/host/context-pipeline.ts](https://github.com/yai-dev/agentrail/blob/main/packages/app/src/host/context-pipeline.ts)

Adapts legacy or runtime-style transform logic back into provider form.

This helper is now legacy-only. It should be used only for prepend-only adapters. If your logic rewrites or removes existing messages, implement `getTransformContext` or use capability `buildTransformContext` instead.

## Orchestration Integration

### `createOrchestrationRegistry`

Defined in:

- [packages/app/src/host/orchestration-registry.ts](https://github.com/yai-dev/agentrail/blob/main/packages/app/src/host/orchestration-registry.ts)

Manages per-session orchestration managers and lazy run initialization.

```ts
import { createOrchestrationRegistry } from "@agentrail/app/advanced";

const orchestrationRegistry = createOrchestrationRegistry({ dataDir });
```

## Session Store Boundary

All host primitives depend on the `AgentrailSessionStore` contract rather than a concrete session manager implementation.

That means you can plug in:

- the default file-backed `SessionManager`
- a compatible custom store
- a future non-filesystem-backed store, as long as it satisfies the contract

See [Session Store Reference](session-store.md) for the required shape.

## Typical Custom Host Flow

A custom host usually looks like this:

1. build or inject a session store
2. build a profile resolver
3. assemble plugins
4. assemble context providers or a transform function
5. mount `createChatRoute` and/or `createStreamRoute`

The primitives are designed so you can replace any one of those steps without rewriting the whole stack.

## Recommendation

Prefer `createAgentApp` from `@agentrail/app` for most applications. Drop to primitives from `@agentrail/app/advanced` only for the part that truly needs custom control.

## Related Docs

- [Compatibility APIs Reference](host-defaults.md)
- [Profile Contract Reference](profile-contract.md)
- [Plugin Contract Reference](plugin-contract.md)
