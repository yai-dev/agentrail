import { describe, it, expect } from "vitest";
import { MockLlmProvider } from "../src/mock-llm-provider";
import { createTestAgent } from "../src/test-agent-factory";
import { assertToolCalled, assertToolCalledWith, assertFinalText } from "../src/assertions";

describe("Testing Package", () => {
  it("should run a test agent with mock provider", async () => {
    const mock = new MockLlmProvider([
      { 
        text: "I'll call the weather tool.", 
        toolCalls: [{ name: "get_weather", input: { city: "Tokyo" } }] 
      },
      { text: "It's 22°C and sunny in Tokyo." }
    ]);

    const agent = createTestAgent({ 
      definition: {
        id: "test-agent",
        system: "You are a testing assistant",
        model: "mock:mock-model",
      }, 
      llmProvider: mock 
    });

    const result = await agent.invoke("What's the weather in Tokyo?");
    
    expect(result.text).toContain("I'll call the weather tool.");
    expect(result.toolCalls[0].name).toBe("get_weather");
    expect(result.toolCalls[0].args).toEqual({ city: "Tokyo" });

    // Assertions check for the *last* turn or the overall result?
    // Wait, the result object contains all turns' messages.
    // However, our Mock provider only returned 1 message per invoke.
    // If the tool is handled, invoke would call agent loop again.
    // Our agent definition doesn't define any real tool, so the toolcall
    // wouldn't get answered unless we mock tool results. 
    // In agent-impl.ts, if tools exist, it tries to execute them. If not found, it throws ToolNotFoundError.
    // But since `get_weather` isn't provided, it will throw ToolNotFoundError.
  });
});
