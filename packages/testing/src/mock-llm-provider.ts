import type { 
  LlmProvider, 
  LlmRequest, 
  LlmStream, 
  LlmStreamEvent,
  AssistantMessage, 
  StopReason,
  AssistantContent,
  ToolCall,
  Usage
} from "@agentrail/core";

export interface MockProviderResponse {
  text?: string;
  toolCalls?: { name: string; input: any }[];
  thinking?: string;
}

export class MockLlmProvider implements LlmProvider {
  public provider = "mock";
  private responses: MockProviderResponse[];
  private callCount = 0;

  constructor(responses: MockProviderResponse[]) {
    this.responses = responses;
  }

  stream(request: LlmRequest): LlmStream {
    const response = this.responses[this.callCount++];
    if (!response) {
      throw new Error(`MockLlmProvider: No response defined for call #${this.callCount}`);
    }

    const { messages, model } = request;
    const callIndex = this.callCount;
    const content: AssistantContent[] = [];
    
    if (response.text) {
      content.push({ type: "text", text: response.text });
    }
    
    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const [index, tc] of response.toolCalls.entries()) {
        content.push({
          type: "toolCall",
          id: `call_${callIndex}_${index}`,
          name: tc.name,
          arguments: tc.input
        });
      }
    }

    const stopReason: Extract<StopReason, "stop" | "length" | "toolUse"> = 
        (response.toolCalls && response.toolCalls.length > 0) ? "toolUse" : "stop";

    const partialMessage: AssistantMessage = {
      role: "assistant",
      content: [],
      provider: this.provider,
      modelId: model.modelId,
      usage: {
        inputTokens: 10,
        outputTokens: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 20,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0
        }
      },
      stopReason,
      timestamp: Date.now()
    };

    const finalMessage: AssistantMessage = { ...partialMessage, content };

    async function* generateEvents(): AsyncIterable<LlmStreamEvent> {
      yield { type: "start", partial: partialMessage };
      
      let contentIndex = 0;
      
      if (response.text) {
        yield { type: "text_start", contentIndex, partial: partialMessage };
        yield { type: "text_end", contentIndex, content: response.text, partial: partialMessage };
        contentIndex++;
      }
      
      if (response.toolCalls) {
        for (const [index, tc] of response.toolCalls.entries()) {
          const toolCall: ToolCall = {
            type: "toolCall",
            id: `call_${callIndex}_${index}`,
            name: tc.name,
            arguments: tc.input
          };
          yield { type: "toolcall_start", contentIndex, partial: partialMessage };
          yield { type: "toolcall_end", contentIndex, toolCall, partial: partialMessage };
          contentIndex++;
        }
      }
      
      yield { type: "done", reason: stopReason, message: finalMessage };
    }

    const streamObj: LlmStream = {
      [Symbol.asyncIterator]: () => generateEvents()[Symbol.asyncIterator](),
      result: async () => finalMessage
    };

    return streamObj;
  }
}
