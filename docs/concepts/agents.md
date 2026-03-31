# Agents

In Agentrail, an agent is the runtime unit that receives input, calls models and tools, and returns messages or streamed events.

## Core Ideas

- `@agentrail/runtime-core` defines the base agent contract.
- Hosted applications usually wrap agents in a profile instead of exposing raw runtime agents directly.
- A hosted profile decides how an agent is created for a specific request context.

## Agent Lifecycle

Every agent execution follows this loop:

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
  ┌─────────┐    yes    ┌─────────┴────────┐
  │ Tool     │──────────►│  Execute Tools   │
  │ Calls?   │          │  Return Results  │
  └────┬─────┘          └──────────────────┘
       │ no
       ▼
  Assistant Response
```

The agent loop continues calling the LLM as long as the model requests tool calls. When the model produces a final text response (or the turn limit is reached), the loop ends.

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
  tools: [/* runtime tools */],
  maxTurns: 20,
  thinkingEnabled: false,
});
```

## Key Configuration Fields

| Field | Purpose |
|-------|---------|
| `id` | Unique identifier for the agent |
| `model` | LLM provider, model ID, and credentials |
| `system` | System prompt text |
| `tools` | Array or record of runtime tools the agent can use |
| `maxTurns` | Maximum number of LLM call rounds before forcing a final response |
| `maxTurnsMessage` | Custom instruction appended on the last turn |
| `temperature` | Sampling temperature |
| `thinkingEnabled` | Whether to enable extended thinking (Anthropic) |
| `maxTokens` | Maximum output tokens per LLM call |

## Agent vs Profile

These are two different layers:

- **Agent** is a runtime concept — it defines the execution loop, model, tools, and system prompt.
- **Profile** is a host concept — it defines how an agent is created for a specific request context (tenant, user, session).

In most hosted apps, you never use agents directly. Instead, you define a profile that constructs agents on demand. See [Profiles](profiles.md).

## Related Concepts

- [Profiles](profiles.md)
- [Host](host.md)
- [Events and Orchestration](events-and-orchestration.md)
