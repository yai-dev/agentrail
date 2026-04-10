/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it, vi } from "vitest";
import type { AgentLoopConfig, InternalContext, InternalSpec } from "../src/agent/agent-loop.js";
import { agentLoop } from "../src/agent/agent-loop.js";
import type { LlmClient, LlmRequest, LlmStream } from "../src/interfaces/llm-client.js";
import type { AssistantMessage, Message } from "../src/types/message.types.js";
import type { LlmStreamEvent, RuntimeEvent } from "../src/types/result.types.js";
import type { Usage } from "../src/types/usage.types.js";

const ZERO_USAGE: Usage = {
  inputTokens: 1,
  outputTokens: 1,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function makeContext(): InternalContext {
  return { conversationId: "test-conv", messages: [] };
}

function makeSpec(): InternalSpec {
  return {
    id: "test-agent",
    name: "Test Agent",
    systemPrompt: "You are helpful.",
    model: { provider: "mock", modelId: "mock-model" },
  };
}

function assistantMessage(
  text: string,
  overrides: Partial<AssistantMessage> = {},
): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason: "stop",
    provider: "mock",
    modelId: "mock-model",
    usage: ZERO_USAGE,
    timestamp: Date.now(),
    ...overrides,
  } as AssistantMessage;
}

async function collectEvents(stream: AsyncIterable<RuntimeEvent>): Promise<RuntimeEvent[]> {
  const events: RuntimeEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe("agentLoop reactive compaction recovery", () => {
  it("retries after prompt-too-long with full reactive compaction", async () => {
    const promptTooLong = assistantMessage("provider error", {
      stopReason: "error",
      errorMessage: "context window exceeds limit",
    });
    const success = assistantMessage("Recovered");

    let callCount = 0;
    const llmClient: LlmClient = {
      stream(_request: LlmRequest): LlmStream {
        callCount += 1;
        const events: LlmStreamEvent[] =
          callCount === 1
            ? [{ type: "error", reason: "error", message: promptTooLong }]
            : [
                { type: "start", partial: { ...success, content: [] } },
                { type: "text_end", contentIndex: 0, content: "Recovered", partial: success },
                { type: "done", reason: "stop", message: success },
              ];
        let index = 0;

        return {
          async *[Symbol.asyncIterator]() {
            while (index < events.length) {
              yield events[index++]!;
            }
          },
          async result() {
            return callCount === 1 ? promptTooLong : success;
          },
        };
      },
    };

    const maybeCompact = vi.fn(async ({ messages }: { messages: Message[] }) => ({
      messages: messages.slice(-1),
      strategy: "full" as const,
      trigger: "prompt_too_long" as const,
    }));

    const config: AgentLoopConfig = {
      spec: makeSpec(),
      llmClient,
      reactiveCompaction: {
        isPromptTooLongError: () => true,
        maybeCompact,
      },
    };

    const stream = agentLoop(
      [{ role: "user", content: "hello", timestamp: Date.now() } as Message],
      makeContext(),
      config,
    );
    const events = await collectEvents(stream);

    expect(callCount).toBe(2);
    expect(maybeCompact).toHaveBeenCalled();
    expect(
      maybeCompact.mock.calls.some(([context]) => context.latestMessage?.stopReason === "error"),
    ).toBe(true);
    expect(events.some((event) => event.type === "compaction")).toBe(true);
    expect(events.some((event) => event.type === "session.end")).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === "message.end" && "message" in event && event.message === promptTooLong,
      ),
    ).toBe(false);
  });
});
