# Agents

An agent is the runtime execution unit in Agentrail. It receives a message, calls the LLM, dispatches tools, and produces messages or streamed events.

## What an Agent Is

At the runtime layer, an agent is a value that satisfies the `Agent` interface from `@agentrail/runtime-core`. It holds:

- a model configuration (provider, model ID, API key)
- a system prompt
- a set of tools it can call
- loop control parameters (max turns, token limits)

Agents are stateless between turns. Session history is managed by the host layer, not by the agent itself.

## Defining an Agent

Use `defineAgent` from `@agentrail/runtime-core`:

```ts
import { defineAgent } from "@agentrail/runtime-core";

const agent = defineAgent({
  id: "my-agent",
  model: {
    provider: "anthropic",
    modelId: "claude-sonnet-4-5",
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  system: "You are a helpful assistant.",
  tools: [myTool],
  maxTurns: 20,
});
```

In hosted apps, you rarely call `defineAgent` directly in route setup. Instead, you put this call inside a profile's `createAgent` function so the agent is constructed fresh for each request context.

## Configuration Fields

| Field             | Type                                           | Purpose                                                 |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------- |
| `id`              | `string`                                       | Unique agent identifier                                 |
| `name`            | `string?`                                      | Human-readable label                                    |
| `model`           | `string \| ModelConfig`                        | LLM provider and credentials                            |
| `system`          | `string`                                       | System prompt                                           |
| `tools`           | `RuntimeTool[] \| Record<string, RuntimeTool>` | Tools available to the agent                            |
| `maxTurns`        | `number?`                                      | Maximum LLM call rounds before forcing a final response |
| `maxTurnsMessage` | `string?`                                      | Custom instruction appended on the final forced turn    |
| `maxTokens`       | `number?`                                      | Maximum output tokens per LLM call                      |
| `temperature`     | `number?`                                      | Sampling temperature                                    |
| `thinkingEnabled` | `boolean?`                                     | Enable extended thinking (Anthropic only)               |

## Model Config

The `model` field accepts either a registered provider string or a `ModelConfig` object:

```ts
// Short form — uses a registered provider alias
model: "anthropic/claude-sonnet-4-5"

// Full form — explicit credentials
model: {
  provider: "anthropic",
  modelId: "claude-sonnet-4-5",
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseUrl: "https://custom-proxy.example.com", // optional
}
```

In production, always pass credentials via environment variables. Never embed API keys in source files.

## The Agent Loop

When the agent runs, it executes this loop:

1. Call the LLM with the current message list
2. If the model responds with tool calls, execute each tool in parallel
3. Append tool results to the message list
4. Repeat from step 1
5. When the model responds with a final text message (or `maxTurns` is reached), return

```
User Message
    │
    ▼
┌──────────────┐
│  LLM Call    │◄──────────────────┐
│  (stream)    │                   │
└──────┬───────┘                   │
       │                           │
       ▼                           │
  ┌─────────┐    yes    ┌──────────┴───────┐
  │ Tool     │──────────►  Execute Tools   │
  │ Calls?   │          │  Return Results  │
  └────┬─────┘          └──────────────────┘
       │ no
       ▼
  Assistant Response
```

Each tool execution and each LLM delta are emitted as `RuntimeEvent` values that the host can forward to the client.

## Agent vs Profile

These are two different layers:

- **Agent** is a runtime concept. It defines the execution loop, model, tools, and system prompt.
- **Profile** is a host concept. It defines *how* an agent is constructed for a specific request context (tenant, user, session).

In most hosted apps, you define a profile that calls `defineAgent` inside its `createAgent` function. The host creates a new agent instance per request. You almost never expose a raw agent directly to a route.

See [Profiles](profiles.md) for how to wire agents into a hosted application.

## Related Concepts

- [Tools](tools.md)
- [Profiles](profiles.md)
- [Host](host.md)
- [Events](events.md)
