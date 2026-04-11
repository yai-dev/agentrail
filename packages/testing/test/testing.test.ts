import { defineTool, Type } from "@agentrail/core";
import { describe, expect, it } from "vitest";
import { assertFinalText, assertToolCalled, assertToolCalledWith } from "../src/assertions.js";
import { MockLlmProvider } from "../src/mock-llm-provider.js";
import { createTestAgent } from "../src/test-agent-factory.js";

describe("Testing Package", () => {
  it("should run a test agent with mock provider and execute tools", async () => {
    const mock = new MockLlmProvider([
      {
        text: "I'll call the weather tool.",
        toolCalls: [{ name: "get_weather", input: { city: "Tokyo" } }],
      },
      { text: "It's 22°C and sunny in Tokyo." },
    ]);

    const weatherTool = defineTool({
      name: "get_weather",
      description: "Get the current weather in a given location",
      parameters: Type.Object({ city: Type.String() }),
      execute: async (_params) => ({
        content: [{ type: "text" as const, text: "22°C and sunny" }],
        details: undefined,
      }),
    });

    const agent = createTestAgent({
      definition: {
        id: "test-agent",
        system: "You are a testing assistant",
        model: "openai:gpt-4o",
        tools: [weatherTool],
      },
      llmProvider: mock,
    });

    const result = await agent.invoke("What's the weather in Tokyo?");

    assertToolCalled(result, "get_weather");
    assertToolCalledWith(result, "get_weather", { city: "Tokyo" });
    assertFinalText(result, "22°C");
  });

  it("should assert final text from a plain text response", async () => {
    const mock = new MockLlmProvider([{ text: "Hello, world!" }]);

    const agent = createTestAgent({
      definition: {
        id: "text-agent",
        system: "You are helpful",
        model: "openai:gpt-4o",
      },
      llmProvider: mock,
    });

    const result = await agent.invoke("Say hello");

    assertFinalText(result, "Hello");
    expect(result.text).toContain("Hello, world!");
  });
});
