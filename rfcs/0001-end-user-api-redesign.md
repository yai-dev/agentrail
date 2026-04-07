# Proposal: Redesign Agentrail's End-User API Around Agent, Profile, and Capabilities

I want to start a discussion about Agentrail's public API shape before we lock ourselves into the current surface area.

This post is intentionally forward-looking. It does not describe the framework exactly as it exists today. Instead, it describes the API experience I think we should move toward if we want Agentrail to feel more coherent, teachable, and pleasant to use.

The short version is this:

- Agentrail already has a lot of power internally
- the main problem is not missing features
- the main problem is that the current implementation shape leaks too directly into the first-run developer experience

When a developer first enters the repo today, it is too easy to get stuck on questions like:

- Which APIs am I actually supposed to start with?
- What is the relationship between an agent and a profile?
- When should I use `host/defaults` instead of `host`?
- Which exported APIs are part of the intended product surface, and which ones are lower-level implementation details?

I think we should redesign the official end-user API around three top-level concepts:

- `Agent`
- `Profile`
- `Capabilities`

The goal is to make Agentrail feel like a small product language that developers can learn progressively, rather than a collection of implementation packages that they have to reverse-engineer.

## Why I Think This Is Worth Doing

Agentrail already has strong foundations:

- runtime execution
- hosted request lifecycles
- session storage
- sandboxing
- knowledge and memory systems
- skills
- orchestration

That is all good. The issue is that new users see too much of that internal structure too early.

From the outside, the framework can feel more like:

- a set of packages
- a set of helpers
- a set of contracts
- a set of examples

than like a cohesive API that teaches people how the system wants to be used.

I think that hurts both:

- human developers
- coding agents that are trying to understand the repo and generate correct integrations

## The Core Model

### 1. Agent

An `Agent` should remain the runtime execution unit.

It should own things like:

- model selection
- prompt or system message definition
- tool access
- runtime behavior such as turn limits

It should not own things like:

- request routing
- session resolution
- app-level profile selection
- hosted application composition

In other words, the runtime layer should stay relatively small and explicit.

### 2. Profile

A `Profile` should be the app-level declaration and composition unit.

It should answer questions like:

- Which app-facing agent entrypoint is this?
- How is the runtime agent selected or created for a request?
- What request-scoped behavior is involved?
- Which capabilities are enabled at the app layer?

A profile is not the same thing as a runtime agent.

I think this distinction matters enough that the public API should teach it directly instead of expecting users to infer it from today's host contracts.

### 3. Capabilities

`Capabilities` should become the official language for app-level extension.

They answer a simple question:

> What can this profile do?

That should cover things like:

- filesystem access
- browser automation
- knowledge retrieval
- skills
- orchestration
- memory and context injection

Internally, these can still map to managers, tool factories, context providers, and plugins. But the public language should be capability-first rather than package-first.

## What the Official API Should Feel Like

At a high level, I think a developer should be able to understand Agentrail as:

1. define an agent
2. define a profile
3. add capabilities
4. create an app

That should be the main teaching path.

If we can make those four steps feel obvious, the rest of the framework becomes much easier to place.

## Proposed Import Surface

I think we should expose a dedicated end-user API surface rather than forcing people to build their mental model from the current implementation-layer package graph.

A plausible shape would be:

- `@agentrail/core`
- `@agentrail/app`
- `@agentrail/capabilities`

These are draft names, not final names. The important part is the grouping principle: the API should be organized by developer intent, not by internal subsystem boundaries.

### `@agentrail/core`

This would hold runtime essentials:

- `defineAgent(...)`
- `defineTool(...)`
- `Type`
- provider registration entrypoints

This package should teach the runtime language and little else.

### `@agentrail/app`

This would hold the app-level composition language:

- `defineProfile(...)`
- `createProfileResolver(...)`
- `createAgentApp(...)`

This package should answer:

> How do I take one or more agents and expose them as a hosted application?

### `@agentrail/capabilities`

This would hold the app-level capability language:

- `filesystem()`
- `browser()`
- `knowledge(...)`
- `skills(...)`
- `orchestration(...)`
- `memoryContext(...)`

This package should answer:

> What should this profile be able to do?

## Proposed Runtime API

The runtime API should stay deliberately small.

```ts
import "@agentrail/core/providers";
import { defineAgent, defineTool, Type } from "@agentrail/core";

const weatherTool = defineTool({
  name: "get_weather",
  description: "Get the weather for a city.",
  parameters: Type.Object({
    city: Type.String(),
  }),
  async execute({ city }) {
    return {
      content: [{ type: "text", text: `${city}: sunny, 26C` }],
      details: { city, condition: "sunny", temperatureC: 26 },
    };
  },
});

const agent = defineAgent({
  id: "assistant",
  model: "openai:gpt-5.4",
  system: "You are a helpful assistant.",
  tools: [weatherTool],
});
```

A few notes on this direction:

- `defineAgent(...)` stays the main runtime primitive
- `defineTool(...)` becomes the preferred object-style tool API
- the existing fluent `tool()` builder can still exist, but should stop being the default teaching path
- lower-level runtime classes should remain available without dominating the first-screen experience

## Proposed Profile API

I think the app-level API should revolve around `defineProfile(...)`.

There are two main shapes that seem worth supporting.

### Static profile shape

```ts
import { defineProfile } from "@agentrail/app";

const assistantProfile = defineProfile({
  id: "assistant",
  name: "Assistant",
  agent: {
    model: "openai:gpt-5.4",
    prompt: "You are a helpful assistant.",
    tools: [],
  },
});
```

This is the small, happy-path version.

### Dynamic profile shape

```ts
import { defineProfile } from "@agentrail/app";
import { defineAgent } from "@agentrail/core";

const assistantProfile = defineProfile({
  id: "assistant",
  name: "Assistant",
  async createAgent(context) {
    return defineAgent({
      id: "assistant-runtime",
      model: "openai:gpt-5.4",
      system: buildPrompt(context),
      tools: buildToolsForRequest(context),
    });
  },
});
```

This is the advanced path for request-scoped behavior.

### Profile design rules

If we go in this direction, I think we should enforce a few simple rules:

- `Profile` and `Agent` remain distinct concepts
- a profile should support either an inline `agent` declaration or `createAgent(context)`
- request-scoped behavior should stay explicit
- the main public profile API should not expose vague extension points like `unknown`

## Proposed Capability API

Capabilities are how app-level code should express behavior composition.

A profile using capabilities might look like this:

```ts
import { defineProfile } from "@agentrail/app";
import {
  filesystem,
  browser,
  knowledge,
  skills,
  orchestration,
} from "@agentrail/capabilities";

const researchProfile = defineProfile({
  id: "research",
  name: "Research Assistant",
  agent: {
    model: "openai:gpt-5.4",
    prompt: "You can research, browse, and delegate work.",
  },
  capabilities: [
    filesystem(),
    browser(),
    knowledge(),
    skills({ mode: "delegate" }),
    orchestration(),
  ],
});
```

### Capability design rules

I think capabilities should be:

- explicit
- composable
- declarative at the app layer
- internally mapped to existing tools, managers, or context providers

I do not think they should become a magic layer that silently creates behavior users cannot see.

### Expected first-wave capabilities

- `filesystem()`
  - backed by current sandboxed file and shell tools
- `browser()`
  - backed by current browser automation tools
- `knowledge(...)`
  - backed by the current knowledge manager and KB tools
- `skills(...)`
  - backed by the current skill manager and skill tool builder
- `orchestration(...)`
  - backed by the current orchestration manager and tool factories
- `memoryContext(...)`
  - backed by the current memory-index and context-injection path

## Proposed App API

The hosted app entrypoint should be centered on `createAgentApp(...)`.

A minimal shape might look like this:

```ts
import { createAgentApp, defineProfile } from "@agentrail/app";
import { filesystem } from "@agentrail/capabilities";

const assistant = defineProfile({
  id: "assistant",
  name: "Assistant",
  agent: {
    model: "openai:gpt-5.4",
    prompt: "You are a coding assistant.",
  },
  capabilities: [filesystem()],
});

const app = createAgentApp({
  dataDir: "./data",
  profiles: [assistant],
});
```

### What `createAgentApp(...)` should do

I think it should be responsible for:

- assembling chat and stream routes
- setting up default session storage
- setting up default sandbox runtime when needed
- wiring capabilities into profile execution
- exposing a clear hosted-app integration path

### What it should not do

I do not think it should:

- hide all infrastructure completely
- depend on global singletons by default
- make mounting behavior magical or implicit

The point is not to remove control. The point is to make the common path short and coherent.

## What Happens to Existing Packages

I do not think this redesign means the current packages disappear.

Instead, I think it gives them a cleaner place in the mental model.

### What remains true

- `runtime-core` remains the runtime implementation layer
- `host` remains the low-level hosted lifecycle layer
- `memo`, `sandbox`, `knowledge`, `skills`, and `orchestration` remain the implementation packages backing the official API

### What changes

- these implementation-layer packages should stop defining the first-run developer experience
- the official docs, scaffold, and minimal examples should teach the new API first
- lower-level APIs can remain available, but should be framed as primitive, advanced, or compatibility-oriented where appropriate

## What This Implies for Current APIs

This proposal has direct consequences for some current public names.

### Profile-related APIs

The current path built around `defineHostedProfile(...)` and `createHostedProfileResolver(...)` is too tightly coupled to the current implementation layering.

If we move in this direction:

- `defineProfile(...)` becomes the official app-level declaration API
- `createProfileResolver(...)` becomes the official resolver concept
- the current hosted-profile path becomes internal, advanced, or compatibility-oriented

### Runtime tool APIs

The current `tool()` builder can stay, but I do not think it should remain the default first-screen tool-definition story.

If we move in this direction:

- `defineTool(...)` becomes the preferred product API
- `tool()` becomes a lower-level builder API

### Route assembly APIs

The current `createChatRoute(...)` and `createStreamRoute(...)` options are still useful, but they are too detailed to be the first hosted-app API new users see.

If we move in this direction:

- `createAgentApp(...)` becomes the default app entrypoint
- `createChatRoute(...)` and `createStreamRoute(...)` remain available as host primitives

## What This Means for Docs and Examples

If Agentrail adopts this direction, I think the docs should stop teaching the implementation layer first.

### The scaffold should change

`create-agentrail-app` should generate a project that uses:

- the new runtime API
- the new profile API
- the new app API
- the new capability API

### Minimal examples should change

The docs should introduce three minimal examples:

- a minimal runtime agent
- a minimal hosted app
- a minimal multi-agent app

### Reference apps should keep their role

`playground-server` and other richer examples should stay, but they should be clearly positioned as reference implementations rather than as the default way to learn the framework.

## Suggested Implementation Order

If we decide this direction makes sense, I think the implementation should start from the product surface and examples rather than from deep internal rewrites.

A reasonable order would be:

1. finalize the official import surface
2. finalize `defineProfile(...)`
3. finalize capability descriptors
4. finalize `createAgentApp(...)`
5. add `defineTool(...)`
6. migrate the scaffold and minimal examples
7. rewrite docs and package READMEs
8. classify or clean up legacy entrypoints before GA

That keeps the redesign grounded in actual developer experience instead of abstract internal refactors.

## Questions I Would Love Feedback On

I would especially love feedback on these points:

1. Does `Agent` / `Profile` / `Capabilities` feel like the right top-level model?
2. Are `@agentrail/core`, `@agentrail/app`, and `@agentrail/capabilities` good names, or just useful placeholders?
3. Should `defineProfile(...)` support both `agent` and `createAgent(...)`, or should one be pushed more strongly as the default?
4. Does the capability model feel clearer than the current package-first model?
5. What should `createAgentApp(...)` return: a Hono app, a route bundle, or a framework-neutral mountable object?
6. Which current APIs feel important enough that we should preserve them as low-level escape hatches?

## Closing Thought

This is not a migration guide and it is not a description of the current API.

It is a proposal for the API surface Agentrail should eventually present to end users if we want the framework to feel more coherent, more teachable, and more intentional.

If this direction feels right, the next step would be to turn it into a concrete implementation plan and then walk package by package through what needs to change.
