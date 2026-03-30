# Playground Server

The playground server is the main hosted example application in the repository.

It is the best place to study how the current Agentrail pieces fit together in a realistic host application.

## What It Demonstrates

- mounting chat and stream routes
- using hosted profiles
- using default capability builders
- plugin-based slash commands and request hooks
- orchestration-aware streaming

## Why This Example Matters

The playground server is not just a demo endpoint. It is currently the clearest reference implementation for:

- how to mount Agentrail host routes
- how to resolve a hosted profile
- how to combine context providers, plugins, and orchestration
- how to keep framework code separate from example-specific behavior

If you are trying to build your own server, this example is usually a better starting point than reading one low-level package in isolation.

## Main Files To Read

Start with these files:

- route assembly:
  - [examples/playground-server/src/routes/chat.ts](../../examples/playground-server/src/routes/chat.ts)
  - [examples/playground-server/src/routes/stream.ts](../../examples/playground-server/src/routes/stream.ts)
- profile definition:
  - [examples/playground-server/src/profiles/default-profile.ts](../../examples/playground-server/src/profiles/default-profile.ts)
- prompt assembly:
  - [examples/playground-server/src/prompts/index.ts](../../examples/playground-server/src/prompts/index.ts)
- plugin assembly:
  - [examples/playground-server/src/plugins/index.ts](../../examples/playground-server/src/plugins/index.ts)
- context and runtime wiring:
  - [examples/playground-server/src/context/index.ts](../../examples/playground-server/src/context/index.ts)

## Request Flow

The high-level request path looks like this:

1. incoming request hits `chat` or `stream`
2. host route resolves session and profile
3. plugins contribute interception, lifecycle hooks, or attachment behavior
4. context providers are built for the current request
5. the hosted profile creates the agent
6. the host invokes the agent and persists the resulting turn
7. stream mode additionally forwards runtime/orchestration events

This is exactly the kind of structure Agentrail tries to encourage: framework primitives at the bottom, example-specific assembly at the edges.

## Chat vs Stream

The playground mounts both host entry points:

- `chat` for request/response handling
- `stream` for SSE-driven conversations, tool progress, compaction notifications, and orchestration events

The interesting part is that both routes reuse the same surrounding pieces:

- the same session store
- the same profile resolver
- the same plugin list
- the same context-provider builder

That reuse is a good sign that the host/profile/plugin boundaries are working as intended.

## Profile Usage

The playground default profile is defined here:

- [examples/playground-server/src/profiles/default-profile.ts](../../examples/playground-server/src/profiles/default-profile.ts)

This profile shows the recommended shape for application code:

- it builds a profile with `defineHostedProfile`
- it uses the prompt SDK for system prompt construction
- it delegates actual agent creation to the example’s agent assembly layer
- it exports a resolver built with `createHostedProfileResolver`

In other words, the profile owns agent identity and construction, not route or infrastructure concerns.

## Prompt Usage

The system prompt assembly lives in:

- [examples/playground-server/src/prompts/index.ts](../../examples/playground-server/src/prompts/index.ts)

This file is worth studying because it shows:

- file-backed prompt fragments
- prompt bundling
- prompt rendering through `createPromptBuilder`
- a clean separation between prompt content and route setup

## Plugin Usage

The plugin list is assembled in:

- [examples/playground-server/src/plugins/index.ts](../../examples/playground-server/src/plugins/index.ts)

Current example plugins cover:

- slash command interception
- attachment hint injection
- user-memory background behavior

This is useful because it shows how to keep horizontal concerns out of the route files.

## What Is Framework-Level vs Example-Level

Framework-level pieces used by this example:

- `@agentrail/host`
- `@agentrail/host/defaults`
- `@agentrail/prompts`
- `@agentrail/memo`
- `@agentrail/sandbox`
- `@agentrail/orchestration`
- `@agentrail/plugin-user-memory`

Example-level pieces specific to this app:

- the actual system prompt content
- the concrete default profile name and identity
- slash command definitions
- attachment hint wording
- the particular combination of enabled workflows and routes

## What Is Example-Specific

- concrete prompt content
- command wiring
- specific example plugins
- example route composition

## How To Use This Example As A Template

If you want to build your own hosted app, the safest path is:

1. copy the route/profile/plugin structure, not the exact prompt content
2. keep one default profile first
3. replace the prompt bundle and app-specific plugins
4. only add custom route logic after the basic host path is working

This keeps your first app close to the Agentrail happy path while still giving you room to specialize.

## Related Docs

- [Quickstart](../guides/quickstart.md)
- [Build a Profile](../guides/build-a-profile.md)
- [Manage Prompts](../guides/manage-prompts.md)
- [Host Defaults Reference](../reference/host-defaults.md)
