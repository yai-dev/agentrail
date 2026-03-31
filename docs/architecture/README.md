# Architecture Overview

Agentrail is organized as a layered framework.

It is easiest to understand Agentrail as a stack with two verticals:

- a **framework vertical** that provides runtime, host, prompts, orchestration, and capabilities
- an **application vertical** that composes those pieces into hosted apps, profiles, plugins, and workflows

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│  Your App  ·  Profiles  ·  Routes  ·  UI                 │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│  Plugins & Workflows                                     │
│  plugin-user-memory  ·  slash-commands  ·  deep-research │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│  Host  ·  host/defaults                                  │
│                                                          │
│  ◄── prompts        ◄── orchestration                    │
│  ◄── memo           ◄── knowledge                        │
│  ◄── skills         ◄── sandbox  ·  tools  ·  events     │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│  runtime-core                                            │
│  Agent Loop  ·  Tool Contract  ·  LLM Provider API       │
└──────────────────────────────────────────────────────────┘

Arrow direction: top depends on bottom
◄── = consumed by Host layer
```

## Layer Map

### 1. `runtime-core`

Purpose:

- defines agents, tools, model configs, messages, usage, and the runtime execution loop

This is the lowest-level execution layer. It is where the concept of an Agentrail runtime agent begins.

### 2. `host`

Purpose:

- handles request lifecycle
- resolves sessions and profiles
- assembles context
- persists turns
- manages chat and stream entry points

This is the main server-side integration layer.

### 3. `prompts`

Purpose:

- composes prompt fragments into hosted profile prompts and workflow prompts

This layer exists so prompt composition is shared and explicit instead of being reimplemented by each app or workflow.

### 4. `orchestration`

Purpose:

- manages delegated sub-agents, waits, mailboxing, and recovery

This layer powers multi-agent execution and long-running delegated work.

### 5. `capabilities`

Purpose:

- supplies memory, knowledge, skills, sandbox execution, and general-purpose tools

These packages are reusable building blocks that can be turned on, composed, or omitted by hosted apps.

### 6. `plugins and workflows`

Purpose:

- adds optional cross-cutting behavior and higher-level workflows

Examples:

- user-memory lifecycle integration
- deep-research workflow packages
- slash-command host behavior

## How The Layers Relate

The relationship is intentionally directional:

1. runtime-core defines how agents run
2. host decides how requests become agent executions
3. prompts shape what the agent is told
4. orchestration extends execution into managed sub-agent systems
5. capabilities provide reusable functionality available to hosted profiles
6. plugins and workflows adapt the host to app-specific needs

That means Agentrail is not “just a chat framework” and not “just an agent loop.” It is a layered harness for building hosted agent systems.

## Recommended Development Path

Most developers should approach the architecture in this order:

1. understand hosted profiles and the host layer
2. use the defaults SDK first
3. adopt prompts and context providers early
4. add tools and plugins where app-specific behavior appears
5. add orchestration only when the problem actually needs multi-agent work

This order matters because it keeps apps simple until complexity is justified.

## Defaults vs Primitives

One of the central design ideas in Agentrail is:

- **stable primitives**
- **recommended SDK on top**

That split shows up most clearly in the host layer:

- `@agentrail/host` provides primitives
- `@agentrail/host/defaults` provides the recommended hosted SDK

The same idea applies more broadly:

- runtime-core provides low-level execution primitives
- prompts provide composable prompt primitives
- examples demonstrate opinionated assembly

## Framework Core vs Application Code

A useful boundary for contributors is:

Framework core usually includes:

- runtime-core
- host
- prompts
- orchestration
- capability packages

Application code usually includes:

- concrete prompt content
- concrete hosted profiles
- app-local plugins
- route composition
- UI-specific event rendering
- workflow-specific business behavior

Keeping that boundary clean is what makes Agentrail reusable as a framework instead of letting the repository collapse back into a single monolithic app.

## Design Principles

- Prefer stable primitives with a recommended SDK path on top.
- Keep business-domain logic out of framework core packages.
- Make chat and stream hosts share the same lifecycle concepts.
- Keep prompts, plugins, tools, and context injection composable.

## Repository Reading Order

If you want to read the codebase in architecture order, this sequence works well:

1. [Concepts: Agents](../concepts/agents.md)
2. [Concepts: Host](../concepts/host.md)
3. [Guides: Quickstart](../guides/quickstart.md)
4. [Reference: Host Defaults](../reference/host-defaults.md)
5. [Reference: Host Primitives](../reference/host-primitives.md)
6. [Examples: Playground Server](../examples/playground-server.md)

## Next Reading

- [Agents](../concepts/agents.md)
- [Host](../concepts/host.md)
- [Prompts](../concepts/prompts.md)
- [Quickstart](../guides/quickstart.md)
