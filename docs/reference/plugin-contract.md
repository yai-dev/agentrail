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

- [packages/host/src/types.ts](../../packages/host/src/types.ts)

The main capabilities are:

- process lifecycle hooks
- chat interception
- request lifecycle hooks
- context providers
- attachment handling

## Contract Surface

### `name`

A stable plugin identifier for diagnostics and assembly.

### `start`

Runs when the host application starts the plugin lifecycle.

Use it for:

- starting timers
- bootstrapping plugin-owned services
- connecting lightweight host-side background processes

### `stop`

Runs when the host application shuts plugins down.

Use it to clean up anything started in `start`.

### `interceptChatRequest`

Lets a plugin short-circuit or handle a chat request before the host continues with normal profile execution.

This is useful for:

- slash commands
- admin-only request handling
- special command parsing that does not belong in the main runtime agent

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

## Hook Context

Lifecycle hooks receive an `AgentrailRequestLifecycleContext`, which currently includes:

- `kind`
- `tenantId`
- `userId`
- `sessionId`
- `agentId`

This makes plugins suitable for multi-tenant host behavior without forcing them to understand the entire request body shape.

## Execution Model

The current plugin runtime helpers live in:

- [packages/host/src/plugins.ts](../../packages/host/src/plugins.ts)

Important characteristics of the current model:

- plugins run in registration order
- request hooks are awaited sequentially
- chat interceptors stop at the first plugin that returns a handled response
- attachment handlers are merged by concatenating returned context text

That model is intentionally simple. It keeps the plugin contract easy to reason about while the framework API is still stabilizing.

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
