import type { MockLlmProvider } from "@/mock-llm-provider.js";
import type { Agent, AgentConfig } from "@agentrail/core";
import { defineAgent } from "@agentrail/core";

export interface CreateTestAgentOptions {
  definition: AgentConfig;
  llmProvider: MockLlmProvider;
}

export function createTestAgent({ definition, llmProvider }: CreateTestAgentOptions): Agent {
  return defineAgent({
    ...definition,
    llmClient: { stream: (req) => llmProvider.stream(req) },
  });
}
