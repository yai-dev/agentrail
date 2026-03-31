# Quickstart

This guide walks through the shortest realistic path to a working hosted agent on top of Agentrail.

It is intentionally opinionated:

- use `@agentrail/host/defaults` first
- use `@agentrail/prompts` for system prompt composition
- keep your first app to one hosted profile and one session store

## What You Will Build

A minimal Hono server that accepts a chat request, sends it to a real LLM provider, and returns the assistant response. No mock agents, no echo stubs.

## Prerequisites

- Node.js 22+
- pnpm

Set your LLM provider API key as an environment variable:

Do not store API keys in `agentrail.yaml`.

```bash
# Pick one depending on your provider
export ANTHROPIC_API_KEY="sk-ant-..."
# or
export OPENAI_API_KEY="sk-..."
```

## Scaffold a New App

The fastest way to start is with the CLI scaffolding tool:

```bash
pnpm create @agentrail/app my-agent
cd my-agent
pnpm install
```

This generates a working app with a profile, prompt bundle, and Hono server already wired together. Skip ahead to [Run It](#run-it) if you used the scaffold.

If you prefer to understand each piece, follow the manual setup below.

## Manual Setup

### 1. Install dependencies

```bash
mkdir my-agent && cd my-agent
pnpm init
pnpm add @agentrail/runtime-core @agentrail/host @agentrail/prompts @agentrail/memo hono
pnpm add -D typescript tsx
```

### 2. Register LLM providers

Import the built-in provider side-effect modules so the provider registry knows about Anthropic and OpenAI:

```ts
import "@agentrail/runtime-core/providers";
```

This single import registers both providers. The provider is selected at runtime based on the `model.provider` field in your agent config.

### 3. Define a prompt bundle

```ts
import {
  definePromptBundle,
  definePromptFragment,
  renderPrompt,
} from "@agentrail/prompts";

const basePrompt = definePromptBundle({
  fragments: [
    definePromptFragment({
      id: "base",
      content: `
You are a helpful assistant.
Use tools when they reduce uncertainty.
Keep answers concise unless the user asks for depth.
      `.trim(),
    }),
  ],
});
```

### 4. Define a hosted profile

```ts
import { defineAgent } from "@agentrail/runtime-core";
import {
  defineHostedProfile,
  createHostedProfileResolver,
} from "@agentrail/host/defaults";

const defaultProfile = defineHostedProfile({
  id: "default",
  name: "Default Agent",
  promptBuilder: async () => renderPrompt(basePrompt),
  async createAgent() {
    return defineAgent({
      id: "default",
      model: {
        provider: "anthropic",       // or "openai"
        modelId: "claude-sonnet-4-5", // or "gpt-4o"
        apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY,
      },
      system: renderPrompt(basePrompt),
    });
  },
});
```

### 5. Create a session store and mount routes

```ts
import { Hono } from "hono";
import { SessionManager } from "@agentrail/memo";
import { createChatRoute } from "@agentrail/host";

const sessionStore = new SessionManager("/tmp/agentrail");
const resolveProfile = createHostedProfileResolver([defaultProfile]);

const app = new Hono();

app.route(
  "/chat",
  createChatRoute({
    defaultAgentId: "default",
    sessionStore,
    resolveProfile,
  }),
);

export default {
  port: 3000,
  fetch: app.fetch,
};
```

## Run It

```bash
npx tsx main.ts
```

Test with curl:

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is Agentrail?", "tenantId": "dev", "userId": "user-1"}'
```

You should see a real LLM response with token usage information.

## When To Use `createStreamRoute`

Use chat first if your app only needs request/response semantics.

Use stream when you need:

- token or event streaming
- tool progress visibility
- compaction events
- sandbox and workspace awareness
- orchestration event forwarding

## What The Defaults Layer Gives You

The defaults layer is not a black box. It gives you a stable, recommended assembly path for:

- hosted profiles
- profile resolvers
- default capability tool builders
- default context/capability message builders
- orchestration binding helpers

You can adopt these one by one and still drop to lower-level host primitives later.

## Next Steps

Now that you have a working agent, continue in this order:

1. [Build a Profile](build-a-profile.md) — customize your agent's identity and capabilities
2. [Manage Prompts](manage-prompts.md) — compose system prompts from fragments
3. [Add Tools](add-tools.md) — give the agent domain-specific abilities
4. [Add Context](add-context.md) — inject request-time information
5. [Write a Plugin](write-a-plugin.md) — add cross-cutting host behavior

## Deeper Reading

To understand the concepts behind what you just built:

- [Agents](../concepts/agents.md)
- [Host](../concepts/host.md)
- [Profiles](../concepts/profiles.md)
- [Prompts](../concepts/prompts.md)
