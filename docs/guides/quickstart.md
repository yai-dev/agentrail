# Quickstart

This guide walks through the fastest realistic path to a working hosted agent on top of Agentrail.

## What You Will Build

A minimal Hono server that accepts chat requests, sends them to a real LLM provider, and streams back the response as SSE events. Sessions are persisted to disk and long conversations are automatically compacted.

## Prerequisites

- Node.js 22+
- pnpm
- An API key for Anthropic or OpenAI

## Create Your App

The fastest way to start is with the scaffold tool:

```bash
pnpm dlx @agentrail/create-agentrail-app my-agent
cd my-agent
pnpm install
```

### Set your API key

The scaffold generates a `.env.example` with every supported variable. Copy it and fill in your key:

```bash
cp .env.example .env
```

Then edit `.env`:

```bash
MODEL_PROVIDER=anthropic                    # or "openai"
MODEL_ID=claude-3-5-sonnet-20241022         # or "gpt-4o"
ANTHROPIC_API_KEY=sk-ant-...               # set this
# OPENAI_API_KEY=sk-...                    # or this
```

> Do not store API keys in `agentrail.yaml`. Always use environment variables.

### Run it

```bash
pnpm dev
```

### Test with curl

```bash
curl -sN -X POST http://localhost:3000/api/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "What is Agentrail?", "tenantId": "dev", "userId": "user-1"}'
```

You should see SSE events streaming in — text deltas, tool calls if any, usage, and a final `done` event.

## Walk Through the Generated Code

The scaffold generates two source files. Here is what each one does.

### `src/agent.ts` — Profile definition

```ts
export const defaultProfile = defineProfile({
  id: AGENT_ID,
  name: "my-agent Agent",
  agent: {
    model: `${MODEL_PROVIDER}:${MODEL_ID}`,
    prompt: "You are a helpful assistant.",
  },
});
```

A **profile** is the bridge between the host layer and the runtime agent. It declares the agent's identity, model, system prompt, tools, and capabilities. `defineProfile` is the primary way to define profiles — it handles agent construction and prompt assembly automatically.

The file also exports `buildSummarizeFn`, which creates a second agent whose only job is to summarize old conversation turns when the session history grows long. It is a real LLM call — not a placeholder — so compaction stays accurate across long sessions.

### `src/main.ts` — Server entry point

```ts
const agentApp = createAgentApp({
  dataDir: DATA_DIR,
  profiles: [defaultProfile],
  summarize: buildSummarizeFn(),
  compaction: { triggerTokens: 40_000, minMessages: 10 },
});

app.route("/api", agentApp);
```

`src/main.ts` also imports `@agentrail/core/providers` once at startup so the built-in Anthropic and OpenAI providers are registered before requests arrive.

`createAgentApp` handles the full request lifecycle: session lookup or creation, context assembly, LLM streaming, tool dispatch, compaction, and SSE event forwarding. It returns a Hono app with both `/chat` (JSON) and `/stream` (SSE) endpoints.

## Manual Setup (Without Scaffold)

If you prefer to build from scratch, follow the steps below.

### 1. Install dependencies

```bash
mkdir my-agent && cd my-agent
pnpm init
pnpm add @agentrail/core @agentrail/app hono
pnpm add -D typescript tsx
```

### 2. Register LLM providers

```ts
import "@agentrail/core/providers";
```

This single import registers both Anthropic and OpenAI. The provider is selected at runtime by the `model` field in your profile config.

### 3. Define a profile

```ts
import { defineProfile } from "@agentrail/app";

const defaultProfile = defineProfile({
  id: "default",
  name: "Default Agent",
  agent: {
    model: "anthropic:claude-3-5-sonnet-20241022",
    prompt: "You are a helpful assistant.",
  },
});
```

### 4. Mount the agent app

```ts
import type { Message } from "@agentrail/core";
import { Hono } from "hono";
import { createAgentApp } from "@agentrail/app";

// In production, replace this with a real LLM summarization call.
// See src/agent.ts in the scaffold for a complete example.
const summarize = async (messages: Message[]) =>
  messages.map((m) => `${m.role}: ${JSON.stringify(m.content)}`).join("\n");

const app = new Hono();

const agentApp = createAgentApp({
  dataDir: "/tmp/agentrail",
  profiles: [defaultProfile],
  summarize,
  compaction: { triggerTokens: 80_000, minMessages: 20 },
});

app.route("/api", agentApp);

export default { port: 3000, fetch: app.fetch };
```

### 5. Run it

```bash
npx tsx main.ts
```

```bash
# SSE streaming endpoint
curl -sN -X POST http://localhost:3000/api/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "What is Agentrail?", "tenantId": "dev", "userId": "user-1"}'

# JSON endpoint
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is Agentrail?", "tenantId": "dev", "userId": "user-1"}'
```

## `/chat` endpoint vs `/stream` endpoint

|                   | `/chat` (JSON)       | `/stream` (SSE)    |
| ----------------- | -------------------- | ------------------ |
| Response          | JSON                 | SSE event stream   |
| Tool progress     | Not visible          | Streamed as events |
| Compaction events | Not forwarded        | Forwarded via SSE  |
| Sandbox support   | No                   | Yes                |
| Good for          | Simple APIs, testing | Production UIs     |

Both endpoints are mounted automatically by `createAgentApp`. For lower-level control, use `createChatRoute` or `createStreamRoute` from `@agentrail/app` directly (escape-hatch path).

## Next Steps

Now that you have a working agent, continue in this order:

1. [Build a Profile](build-a-profile.md) — customize your agent's identity and capabilities
2. [Manage Prompts](manage-prompts.md) — compose system prompts from fragments
3. [Add Tools](add-tools.md) — give the agent domain-specific abilities
4. [Add Context](add-context.md) — inject request-time information
5. [Write a Plugin](write-a-plugin.md) — add cross-cutting host behavior

## Deeper Reading

- [Agents](../concepts/agents.md)
- [Host](../concepts/host.md)
- [Profiles](../concepts/profiles.md)
- [Session Store](../reference/session-store.md)
