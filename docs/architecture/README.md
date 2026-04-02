# Architecture Overview

Agentrail is organized as a layered framework. Understanding the layers is the fastest path to knowing where your code belongs and how to extend the framework without fighting it.

## The Stack

![Agentrail architecture: four layers from top — Your App (dashed), Plugins & Workflows, Host with capability packages, and runtime-core at the foundation.](/arch-diagram.svg)

Two design axes govern the stack:

**Vertical (dependency direction)** — each layer depends on the one below it, never the reverse. Your app depends on the framework; the framework does not depend on your app.

**Horizontal (composition)** — the Host layer is wide, not just tall. It consumes a set of capability packages (`prompts`, `orchestration`, `memo`, `knowledge`, `sandbox`, `tools`, `events`, `skills`) that are independently usable but designed to be composed by the host.

## Layer Map

### 1. `runtime-core`

The execution foundation. Defines agents, tool contracts, the LLM provider abstraction, the agent loop, message types, and usage tracking.

Everything else in the framework builds on this layer. It has no knowledge of HTTP, sessions, or host lifecycles.

### 2. `host` and `host/defaults`

The main server-side integration layer. Handles:

- HTTP request lifecycle (chat and stream entry points)
- Session lookup and creation
- Profile resolution and agent construction
- Context assembly from providers
- Turn persistence and usage recording
- Context compaction

`@agentrail/host` provides stable primitives. `@agentrail/host/defaults` provides the recommended SDK on top — use `host/defaults` first and drop to primitives only when you need tighter control.

The host layer consumes the capability packages listed in the diagram. They are not hard dependencies of every hosted app — most capability packages are optional and injected through profiles or plugins.

### 3. Plugins and workflows

Optional packages that extend or compose the host. They add cross-cutting behavior (plugins) or higher-level agent patterns (workflows) without modifying the host core.

Current examples: `plugin-user-memory`, `slash-commands`, `deep-research`.

### 4. Your app

Profiles, routes, UI, and business logic. This is the code you write. It uses framework primitives and the defaults SDK but is not part of the framework itself.

## Package Reference

| Package                           | Layer        | Purpose                                                  |
| --------------------------------- | ------------ | -------------------------------------------------------- |
| `@agentrail/runtime-core`         | 1            | Agent loop, tool contract, LLM providers, usage          |
| `@agentrail/host`                 | 2            | Chat/stream lifecycle primitives, session store contract |
| `@agentrail/host/defaults`        | 2            | Recommended hosted SDK on top of host primitives         |
| `@agentrail/prompts`              | 2 (consumed) | Prompt fragment composition and file-backed loading      |
| `@agentrail/orchestration`        | 2 (consumed) | Managed sub-agents, mailboxing, waits, recovery          |
| `@agentrail/memo`                 | 2 (consumed) | Filesystem-backed session storage and compaction         |
| `@agentrail/knowledge`            | 2 (consumed) | Knowledge base retrieval and injection                   |
| `@agentrail/sandbox`              | 2 (consumed) | Docker-based isolated execution per session              |
| `@agentrail/tools`                | 2 (consumed) | General-purpose tools (web search, file I/O, etc.)       |
| `@agentrail/events`               | 2 (consumed) | SSE event types shared between host and clients          |
| `@agentrail/skills`               | 2 (consumed) | Reusable agent skill definitions                         |
| `@agentrail/plugin-user-memory`   | 3            | User memory lifecycle plugin                             |
| `@agentrail/slash-commands`       | 3            | Slash-command host behavior                              |
| `@agentrail/deep-research`        | 3            | Multi-agent deep research workflow                       |
| `@agentrail/config`               | utility      | `agentrail.yaml` parsing and validation                  |
| `@agentrail/create-agentrail-app` | tooling      | Project scaffold CLI                                     |

## Request Lifecycle

Here is what happens when a message arrives at a stream endpoint:

![Agentrail request lifecycle: 8-step flow from POST /api/stream through session, profile, history, compaction, context assembly, agent.stream SSE, persistence, and done.](/lifecycle-diagram.svg)

The chat route (`createChatRoute`) follows the same steps but buffers the full response instead of streaming.

## Defaults vs Primitives

One of the core design ideas in Agentrail is a deliberate split between stable primitives and a recommended SDK path on top.

This split shows up most clearly in the host layer:

- `@agentrail/host` — stable, low-level primitives: session store contract, profile contract, plugin contract, route factories
- `@agentrail/host/defaults` — opinionated SDK: `defineHostedProfile`, `createHostedProfileResolver`, context provider helpers, capability tool builders

Start with `host/defaults`. It is not a black box — it is a recommended assembly of primitives that you can unwrap and replace piece by piece as your app grows.

The same principle applies throughout the framework: runtime-core provides the execution primitive; capability packages provide reusable building blocks; the defaults layer wires them into a recommended path.

## Recommended Development Path

Approach the framework in this order to keep complexity proportional to need:

1. **Read the quickstart** — get a working app from the scaffold first
2. **Understand profiles and the host layer** — this is where most application logic lives
3. **Use the defaults SDK** — adopt `host/defaults` before touching host primitives
4. **Add prompts and context providers early** — they pay off quickly as apps grow
5. **Add tools and plugins where app-specific behavior appears**
6. **Add orchestration only when the problem actually needs multi-agent work**

## Framework Core vs Application Code

A useful boundary for contributors:

**Framework core** (belongs in framework packages):

- runtime-core, host, prompts, orchestration, capability packages

**Application code** (belongs in your app or example projects):

- concrete prompt content, concrete hosted profiles, app-local plugins, route composition, UI-specific event rendering, workflow business logic

Keeping this boundary clean is what makes Agentrail reusable as a framework rather than collapsing into a monolithic app.

## Design Principles

- Stable primitives with a recommended SDK path on top.
- Dependency direction is always framework → runtime-core, never the reverse.
- Chat and stream routes share the same lifecycle concepts.
- Capability packages are independently usable and optionally composed.
- Business-domain logic stays out of framework core packages.

## Repository Reading Order

1. [Concepts: Agents](../concepts/agents.md)
2. [Concepts: Host](../concepts/host.md)
3. [Guides: Quickstart](../guides/quickstart.md)
4. [Reference: Host Defaults](../reference/host-defaults.md)
5. [Reference: Host Primitives](../reference/host-primitives.md)
6. [Examples: Playground Server](../examples/playground-server.md)
