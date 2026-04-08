import type { Agent, AgentConfig } from "@agentrail/runtime-core";
import { defineAgent, LlmProviderRegistry } from "@agentrail/runtime-core";
import type { MockLlmProvider } from "./mock-llm-provider.js";

export interface CreateTestAgentOptions {
  definition: AgentConfig;
  llmProvider: MockLlmProvider;
}

export function createTestAgent(options: CreateTestAgentOptions): Agent {
  const { definition, llmProvider } = options;
  
  // Register the mock provider
  LlmProviderRegistry.resetInstance(); // Reset to prevent leaks across tests
  const registry = LlmProviderRegistry.getInstance();
  registry.register(llmProvider);

  // Override definition model to use the mock provider
  const testDefinition: AgentConfig = {
    ...definition,
    model: {
      provider: llmProvider.provider,
      modelId: definition.model.modelId,
    }
  };

  return defineAgent(testDefinition);
}
