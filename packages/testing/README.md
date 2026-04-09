# @agentrail/testing

Testing utilities and mocks for Agentrail runtime code. It helps write unit tests for agents and tools, but it is not part of the production runtime path.

## Installation

```bash
pnpm add -D @agentrail/testing @agentrail/core
```

## Quick example

```ts
import { defineTool, Type } from "@agentrail/core";
import { MockLlmProvider, assertFinalText, createTestAgent } from "@agentrail/testing";

const echoTool = defineTool({
  name: "echo",
  description: "Echo a string.",
  inputSchema: Type.Object({ value: Type.String() }),
  async execute({ value }) {
    return { content: [{ type: "text", text: value }] };
  },
});

const provider = new MockLlmProvider([{ text: "done" }]);

const agent = createTestAgent({
  llmProvider: provider,
  definition: {
    name: "test-agent",
    systemPrompt: "Return a short answer.",
    model: { provider: "mock", modelId: "mock-model" },
    tools: [echoTool],
  },
});

const result = await agent.run("hello");
assertFinalText(result, "done");
```

## API

- `MockLlmProvider` — deterministic mock provider for unit tests.
- `createTestAgent(options)` — create a test agent backed by a mock provider.
- `MockSessionStore` — in-memory session-store test double.
- `assertFinalText(result, expected)` — assert the final assistant text.
- `assertToolCalled(result, toolName)` / `assertToolCalledWith(...)` — assert tool usage.

Reference:
- `https://agentrail.run/concepts/agents`
- `https://agentrail.run/guides/quickstart`

## Related packages

- `@agentrail/core` — runtime package under test.
- `@agentrail/app` — useful when testing hosted request flows alongside mock session storage.

## License

Apache-2.0
