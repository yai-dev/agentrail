# Host Defaults Reference

The defaults layer provides the recommended SDK for most developers.

## When To Read This Page

Read this page when:

- you want the recommended Agentrail SDK path
- you are wiring your first hosted app
- you want to know which defaults helper should own which responsibility

Use it when you want Agentrail to feel like a framework instead of a bag of primitives.

## Purpose

`@agentrail/host/defaults` exists to answer a very practical question:

> What is the default, recommended way to assemble a hosted Agentrail app?

The defaults layer is where Agentrail becomes opinionated. It helps you:

- define hosted profiles without hand-writing resolver glue
- assemble common capability toolsets
- assemble common context/capability injections
- wire orchestration support in a consistent way

If you do not already know that you need `@agentrail/host` primitives directly, start here.

## Main APIs

- `defineHostedProfile`
- `createHostedProfileResolver`
- `createDefaultContextProviders`
- `createDefaultToolset`
- `createDefaultOrchestrationBinding`
- `createDefaultCapabilityTransformContext`
- `createDefaultCapabilityContextProviders`
- `buildDefaultCapabilityTools`

## API Roles

### `defineHostedProfile`

Defines a profile in the shape the defaults layer expects.

Use it when you want to declare:

- profile identity (`id`, `name`)
- prompt or prompt builder
- `createAgent`
- optional request handling overrides
- optional orchestration or workflow hooks

### `createHostedProfileResolver`

Builds a resolver from a list of hosted profiles.

Use it when:

- you have one or more profiles
- you want the host to resolve them by id
- you do not want to maintain custom `if/else` or map logic in route setup

### `createDefaultContextProviders`

Builds the recommended context-provider stack for a host app.

This is useful when you want to prepend structured context such as:

- memory index summaries
- knowledge-base summaries
- skills index summaries
- workspace snapshots

### `createDefaultCapabilityTransformContext`

Builds a transform function for the runtime request path using the default capability-aware context assembly flow.

Use this when you already work with `transformContext` and want the defaults layer to build it for you.

### `buildDefaultCapabilityTools`

Builds the default capability-oriented toolset used by the example hosts.

This covers the “usual first host” tool surface, including combinations of:

- ask-user
- todo writing
- knowledge-base tools
- skill tools
- sandbox-backed file tools
- browser tools when sandbox support is enabled

### `createDefaultOrchestrationBinding`

Provides the recommended binding shape for integrating hosted profiles with orchestration managers.

Use it when you want:

- managed sub-agent creation
- a clean orchestration registration path
- event forwarding to host routes

## Typical Assembly Pattern

Most hosted apps follow this order:

1. define a prompt bundle
2. define one or more hosted profiles
3. create a resolver with `createHostedProfileResolver`
4. create context/tool defaults
5. mount `createChatRoute` and optionally `createStreamRoute`

## What The Defaults Layer Does Not Hide

The defaults layer is intentionally opinionated, but it is not magical.

You still provide:

- your session store
- your prompt content
- your runtime model/provider settings
- your plugins
- your example- or domain-specific tools

You can also override one part at a time instead of replacing the whole layer.

## When To Drop Down To Primitives

Use `@agentrail/host` directly when you need:

- a custom request lifecycle
- non-default profile resolution rules
- custom context ordering rules
- a completely custom toolset builder
- a host integration that does not look like the example apps

See [Host Primitives](host-primitives.md) when you intentionally want that lower-level control.
