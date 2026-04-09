# @agentrail/core

Core runtime primitives for Agentrail: agents, tools, prompts, sessions, and LLM provider integration. It does not provide hosted routes, profiles, or application-level persistence.

## Installation

```bash
pnpm add @agentrail/core
```

## Quick example

```ts
import "@agentrail/core/providers";
import { Type, defineAgent, defineTool } from "@agentrail/core";

const addTool = defineTool({
  name: "add",
  description: "Add two integers.",
  inputSchema: Type.Object({
    a: Type.Number(),
    b: Type.Number(),
  }),
  async execute({ a, b }) {
    return { content: [{ type: "text", text: String(a + b) }] };
  },
});

const agent = defineAgent({
  name: "math-agent",
  systemPrompt: "Use tools when needed.",
  model: {
    provider: "openai",
    modelId: "gpt-4.1-mini",
  },
  tools: [addTool],
});
```

## API

- `defineAgent(config)` — define a runnable agent with model, tools, and prompt config.
- `defineTool(definition)` — define a structured runtime tool.
- `tool()` / `defineSimpleTool()` — fluent tool builders for advanced cases.
- `createPromptBuilder(bundle)` — render layered prompt bundles.
- `DefaultLlmClient` and `LlmProviderRegistry` — provider integration entrypoints.
- `Type` — TypeBox export for schemas used by tools and typed data.

Reference:
- `https://agentrail.run/concepts/agents`
- `https://agentrail.run/reference/prompt-sdk`

## Related packages

- `@agentrail/app` — hosted server layer built on top of the core runtime.
- `@agentrail/capabilities` — reusable capability descriptors built on the core contracts.

## License

Apache-2.0
