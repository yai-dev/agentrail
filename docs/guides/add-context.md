# Add Context

Context providers are the primary way to inject runtime context into hosted requests. When you need to rewrite existing history, use a transform context instead of forcing that logic through a provider.

## Prerequisites

Read this guide after:

- [Quickstart](quickstart.md)
- [Build a Profile](build-a-profile.md)
- [Concepts: Memory and Context](../concepts/context-and-compaction.md)

They are the main way to answer questions like:

- what should be prepended before runtime history?
- which identity or tenant hints should the agent see?
- which memory, knowledge, or workspace summaries should be visible?

If profiles define _who the agent is_, context providers define _what the agent knows at request time_.

## Typical Context Inputs

Common context inputs include:

- user identity
- memory summaries
- knowledge summaries
- skills summaries
- workspace snapshots
- date or runtime metadata

These are usually injected as synthetic user messages ahead of the conversation history.

## Two Ways To Add Context

### 1. Add direct `ContextProvider`s

Use a provider when you want a simple, explicit injection function:

```ts
import type { ContextProvider } from "@agentrail/app";

const identityProvider: ContextProvider = async (context) => {
  return [
    {
      role: "user",
      content: `Current tenant: ${context.tenantId}\nCurrent user: ${context.userId}`,
      timestamp: Date.now(),
    },
  ];
};
```

This is the cleanest path when the logic is already easy to express as “return some messages”.

### 2. Add a `TransformContextFn`

Use a transform when you need to rewrite the existing message array before the model sees it:

- compacting large `toolResult` messages
- redacting or normalizing history
- composing multiple request-time rewrites

Use `createTransformContext(...)` to combine rewrite transforms with providers. `createContextProviderFromTransform(...)` still exists as a legacy prepend-only adapter, but it is no longer the recommended way to express rewrite logic.

## Recommended Path

Use `createDefaultCapabilityContextProviders` and `createDefaultCapabilityTransformContext` if your host follows the default capability model.

That path is especially useful when you want to compose:

- memory index summaries
- knowledge metadata summaries
- skills inventory context
- workspace snapshots

The current implementation lives in:

- [packages/capabilities/src/memory/context.ts](../../packages/capabilities/src/memory/context.ts)

## Repository Example

The playground example builds request context here:

- [examples/playground-server/src/context/index.ts](../../examples/playground-server/src/context/index.ts)

That file is a good example of how to:

- keep manager singletons outside route files
- build context providers per request
- combine framework defaults with example-specific runtime wiring

## Ordering Matters

Context providers are not just a bag of helpers. Their order affects the final prompt seen by the model.

In general:

- identity/date/context headers should come first
- memory and knowledge summaries should come before current request history
- workspace snapshots should come late enough to reflect the current state

If providers start depending on subtle ordering assumptions, that is a sign to group or simplify them.

## What To Put In Context Providers

Good provider content is:

- compact
- stable across one request
- clearly informational
- safe to prepend as synthetic context

Bad provider content is:

- highly conversational text that belongs in the actual prompt
- route-specific branching logic
- large raw documents when a summary or index would do

## Common Mistakes

Avoid these patterns:

- loading too much raw state into every request
- mixing prompt identity with request-time context
- putting context assembly directly into route handlers
- using providers for behavior that should actually be a tool

## Lower-Level API

If the defaults layer is too opinionated, use these primitives directly:

- `ContextProvider`
- `TransformContextFn`
- `composeTransformContexts`
- `createTransformContext`
- `createContextProviderFromTransform`

These live in `@agentrail/app/advanced` and `@agentrail/capabilities` and let you build a custom context pipeline without adopting the default capability stack.

## Related Docs

- [Build a Profile](build-a-profile.md)
- [Host Defaults Reference](../reference/host-defaults.md)
- [Session Store Reference](../reference/session-store.md)

## Next Step

If your context pipeline is in place, the next extension point is usually [Write a Plugin](write-a-plugin.md) or [Manage Prompts](manage-prompts.md).
