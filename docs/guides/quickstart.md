# Quickstart

This guide walks through the shortest realistic path to a working hosted agent on top of Agentrail.

It is intentionally opinionated:

- use `@agentrail/host/defaults` first
- use `@agentrail/prompts` for system prompt composition
- keep your first app to one hosted profile and one session store

## Prerequisites

Read this guide after:

- [Agents](../concepts/agents.md)
- [Host](../concepts/host.md)
- [Profiles](../concepts/profiles.md)

## What You Need

Before you start, make sure you understand these concepts:

- a **profile** defines which agent to run and how it is assembled
- the **host** owns chat/stream request lifecycles
- the **session store** owns persistent conversation state
- the **prompt bundle** assembles the system instructions for a profile

## Recommended Imports

For a first app, start with these packages only:

- `@agentrail/runtime-core`
- `@agentrail/host`
- `@agentrail/host/defaults`
- `@agentrail/prompts`
- `@agentrail/memo`
- `@agentrail/sandbox` if you want stream + workspace support

## Minimal Flow

The recommended path has five steps:

1. Define a prompt bundle with `@agentrail/prompts`
2. Define a hosted profile with `defineHostedProfile`
3. Build a profile resolver with `createHostedProfileResolver`
4. Mount `createChatRoute` and optionally `createStreamRoute`
5. Provide a session store and, for streaming, a sandbox manager

## Minimal Example

```ts
import { Hono } from "hono";
import { defineAgent } from "@agentrail/runtime-core";
import { SessionManager } from "@agentrail/memo";
import {
  createChatRoute,
  createStreamRoute,
} from "@agentrail/host";
import {
  defineHostedProfile,
  createHostedProfileResolver,
} from "@agentrail/host/defaults";
import {
  definePromptBundle,
  definePromptFragment,
  renderPrompt,
} from "@agentrail/prompts";
```

### 1. Define a prompt bundle

```ts
const basePrompt = definePromptBundle({
  fragments: [
    definePromptFragment({
      id: "base",
      content: `
You are a helpful hosted agent.
Use tools when they reduce uncertainty.
Keep answers concise unless the user asks for depth.
      `.trim(),
    }),
  ],
});
```

### 2. Define a hosted profile

```ts
const defaultProfile = defineHostedProfile({
  id: "default",
  name: "Default Agent",
  prompt: async () => renderPrompt(basePrompt),
  async createAgent(context) {
    return defineAgent({
      id: "default",
      description: "Minimal hosted agent",
      async invoke(input, runtimeContext) {
        return {
          role: "assistant",
          content: [{ type: "text", text: `Echo: ${input}` }],
          provider: "example",
          modelId: "example",
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "stop",
          timestamp: Date.now(),
        };
      },
    });
  },
});
```

### 3. Create a resolver and session store

```ts
const sessionStore = new SessionManager("/tmp/agentrail");
const resolveProfile = createHostedProfileResolver([defaultProfile]);
```

### 4. Mount the host routes

```ts
const app = new Hono();

app.route(
  "/chat",
  createChatRoute({
    defaultAgentId: "default",
    sessionStore,
    resolveProfile,
  }),
);
```

Add `createStreamRoute(...)` when you need:

- event streaming
- long-running tool activity
- workspace visibility
- orchestration events

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

## Common Next Steps

After the minimal setup works, most developers continue in this order:

1. Add a better system prompt and variables
2. Add tools
3. Add context providers
4. Add plugins
5. Add orchestration or workflow packages

## Next Guides

- [Build a Profile](build-a-profile.md)
- [Add Tools](add-tools.md)
- [Add Context](add-context.md)
- [Write a Plugin](write-a-plugin.md)
- [Manage Prompts](manage-prompts.md)

## Next Step

Once the minimal app shape makes sense, continue with [Build a Profile](build-a-profile.md).
