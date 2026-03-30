# Host Primitives Reference

The host primitives expose the lower-level request orchestration layer.

## When To Read This Page

Read this page when:

- the defaults layer is no longer enough
- you need route-level or lifecycle-level control
- you want to understand the host package beneath `@agentrail/host/defaults`

Use these when your application needs custom lifecycle or routing behavior beyond the defaults layer.

If `@agentrail/host/defaults` is the recommended happy path, `@agentrail/host` is the toolbox underneath it.

## When To Use Host Primitives

Use the primitives directly when:

- your request lifecycle differs from the example host flow
- you need custom profile resolution rules
- you want to mix your own context pipeline with only part of the defaults layer
- you need custom streaming or orchestration behavior
- you are integrating Agentrail into an existing server architecture

If you do **not** already know that you need one of those, start with [Host Defaults](host-defaults.md) first.

## Main APIs

- `createChatRoute`
- `createStreamRoute`
- `createProfileResolver`
- `createOrchestrationRegistry`
- `createTransformContext`
- `createContextProviderFromTransform`

## Route Factories

### `createChatRoute`

Defined in:

- [packages/host/src/chat-route.ts](../../packages/host/src/chat-route.ts)

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

### `createStreamRoute`

Defined in:

- [packages/host/src/stream-route.ts](../../packages/host/src/stream-route.ts)

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

## Profile Resolution

### `createProfileResolver`

Defined in:

- [packages/host/src/profile-registry.ts](../../packages/host/src/profile-registry.ts)

This helper builds a simple resolver from a set of profiles.

Use it when:

- you want a primitive resolver
- you are not using the defaults wrapper
- your profile lookup is still id-based and straightforward

If your profile selection becomes policy-driven or mode-driven, you can wrap this helper with your own resolver logic.

## Context Pipeline Helpers

### `createTransformContext`

Defined in:

- [packages/host/src/context-pipeline.ts](../../packages/host/src/context-pipeline.ts)

This helper converts an ordered list of `ContextProvider`s into the runtime `transformContext` function shape.

Use it when:

- you are already working with providers
- the runtime expects a `transformContext`
- you want one explicit place to control provider order

### `createContextProviderFromTransform`

Also defined in:

- [packages/host/src/context-pipeline.ts](../../packages/host/src/context-pipeline.ts)

This helper adapts legacy or runtime-style transform logic back into provider form.

Use it during migration or when some context logic is easier to express as a transform than as a small provider.

## Orchestration Integration

### `createOrchestrationRegistry`

Defined in:

- [packages/host/src/orchestration-registry.ts](../../packages/host/src/orchestration-registry.ts)

This helper manages per-session orchestration managers and lazy run initialization.

Use it when:

- your host supports delegated sub-agents
- you want one orchestration manager per session
- you want host routes and workflows to share orchestration state

It is intentionally host-facing rather than workflow-specific.

## Plugin Runtime Helpers

The primitive host package also includes plugin runtime helpers in:

- [packages/host/src/plugins.ts](../../packages/host/src/plugins.ts)

These are useful when you want to:

- run plugin lifecycle hooks manually
- collect plugin context providers
- run chat interceptors in a custom flow
- combine attachment handlers

## Session Store Boundary

All host primitives depend on the `AgentrailSessionStore` contract rather than a concrete session manager implementation.

That means you can plug in:

- the default file-backed session manager
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

Use host primitives when you need them, but prefer a layered approach:

- start with defaults
- drop to primitives only for the part that truly needs custom control

That keeps your host readable and avoids rebuilding framework assembly logic unnecessarily.

## Related Docs

- [Host Defaults Reference](host-defaults.md)
- [Profile Contract Reference](profile-contract.md)
- [Plugin Contract Reference](plugin-contract.md)
