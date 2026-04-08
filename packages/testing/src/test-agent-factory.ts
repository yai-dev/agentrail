import type { Agent, AgentConfig } from "@agentrail/core";
import { defineAgent } from "@agentrail/core";
import type { MockLlmProvider } from "@/mock-llm-provider.js";

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
