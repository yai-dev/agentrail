/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/**
 * Tests for real-time text event streaming in the agent loop.
 *
 * Previously, text_* events were buffered until the done branch and only flushed
 * when stopReason !== "toolUse". This caused text deltas to be dropped for tool-use
 * turns and to arrive as a single burst rather than token-by-token for text turns.
 *
 * These tests verify that text_* events now produce immediate message.update events.
 */

import { describe, expect, it } from "vitest";
import type { AgentLoopConfig, InternalContext, InternalSpec } from "../src/agent/agent-loop.js";
import { agentLoop } from "../src/agent/agent-loop.js";
import type { LlmClient, LlmRequest, LlmStream } from "../src/interfaces/llm-client.js";
import type { AssistantMessage } from "../src/types/message.types.js";
import type { LlmStreamEvent, RuntimeEvent } from "../src/types/result.types.js";
import type { Usage } from "../src/types/usage.types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ZERO_USAGE: Usage = {
  inputTokens: 1,
  outputTokens: 1,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function makeAssistantMsg(text: string, stopReason: "stop" | "toolUse" = "stop"): AssistantMessage {
  return {
    role: "assistant",
    content:
      stopReason === "toolUse"
        ? [
            { type: "text", text },
            { type: "toolCall", id: "tc1", name: "search", arguments: {} },
          ]
        : [{ type: "text", text }],
    stopReason,
    provider: "mock",
    modelId: "mock",
    usage: ZERO_USAGE,
    timestamp: Date.now(),
  } as unknown as AssistantMessage;
}

/** Creates a minimal LlmClient whose stream yields the given events. */
function makeLlmClient(eventFactory: () => AsyncGenerator<LlmStreamEvent>): LlmClient {
  return {
    stream(_req: LlmRequest): LlmStream {
      const gen = eventFactory();
      let finalMsg: AssistantMessage | null = null;
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              const { done, value } = await gen.next();
              if (done) return { done: true as const, value: undefined };
              if (value.type === "done" || value.type === "error") {
                finalMsg = value.message;
              }
              return { done: false, value };
            },
            [Symbol.asyncIterator]() {
              return this;
            },
          };
        },
        result: async () => {
          if (!finalMsg) {
            // consume remaining to find done
            for await (const _e of eventFactory()) {
              /* just drain */
            }
          }
          return finalMsg!;
        },
      };
    },
  };
}

function makeSpec(): InternalSpec {
  return {
    id: "test-agent",
    name: "Test Agent",
    systemPrompt: "you are helpful",
    model: { provider: "mock", modelId: "mock-model" },
  };
}

function makeContext(): InternalContext {
  return { conversationId: "test-conv", messages: [] };
}

async function collectEvents(stream: AsyncIterable<RuntimeEvent>): Promise<RuntimeEvent[]> {
  const events: RuntimeEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("agent-loop – text event streaming", () => {
  it("text_delta events produce message.update events before message.end (pure text turn)", async () => {
    const finalMsg = makeAssistantMsg("hello world", "stop");
    const partial: AssistantMessage = { ...finalMsg, content: [] };
    const partialWithText: AssistantMessage = {
      ...finalMsg,
      content: [{ type: "text", text: "hello" }],
    };

    async function* llmEvents(): AsyncGenerator<LlmStreamEvent> {
      yield { type: "start", partial };
      yield { type: "text_start", contentIndex: 0, partial };
      yield { type: "text_delta", contentIndex: 0, delta: "hello", partial: partialWithText };
      yield { type: "text_end", contentIndex: 0, content: "hello world", partial: finalMsg };
      yield { type: "done", reason: "stop", message: finalMsg };
    }

    const config: AgentLoopConfig = {
      spec: makeSpec(),
      llmClient: makeLlmClient(llmEvents),
    };

    const stream = agentLoop(
      [{ role: "user", content: "hi", timestamp: 1 } as any],
      makeContext(),
      config,
    );

    const events = await collectEvents(stream);
    const types = events.map((e) => e.type);

    // Use lastIndexOf to target the assistant's message.end (the user's message.end
    // appears earlier in the sequence and would give a false result with indexOf).
    const lastUpdateIdx = types.lastIndexOf("message.update");
    const lastEndIdx = types.lastIndexOf("message.end");
    expect(lastUpdateIdx).toBeGreaterThanOrEqual(0);
    expect(lastEndIdx).toBeGreaterThan(lastUpdateIdx);
  });

  it("text_delta events are NOT dropped when stopReason is toolUse", async () => {
    const partialEmpty: AssistantMessage = makeAssistantMsg("", "toolUse");
    const partialWithText: AssistantMessage = {
      ...partialEmpty,
      content: [{ type: "text", text: "let me search" }],
    };
    const finalMsg = makeAssistantMsg("let me search", "toolUse");

    async function* llmEvents(): AsyncGenerator<LlmStreamEvent> {
      yield { type: "start", partial: partialEmpty };
      yield { type: "text_start", contentIndex: 0, partial: partialEmpty };
      yield {
        type: "text_delta",
        contentIndex: 0,
        delta: "let me search",
        partial: partialWithText,
      };
      yield { type: "text_end", contentIndex: 0, content: "let me search", partial: finalMsg };
      yield { type: "toolcall_start", contentIndex: 1, partial: finalMsg };
      yield {
        type: "toolcall_end",
        contentIndex: 1,
        toolCall: { type: "toolCall", id: "tc1", name: "search", arguments: {} },
        partial: finalMsg,
      };
      yield { type: "done", reason: "toolUse", message: finalMsg };
    }

    // Second call (after tool execution): return a plain text response
    const finalMsg2 = makeAssistantMsg("done", "stop");
    const partial2: AssistantMessage = { ...finalMsg2, content: [] };

    async function* llmEvents2(): AsyncGenerator<LlmStreamEvent> {
      yield { type: "start", partial: partial2 };
      yield { type: "text_start", contentIndex: 0, partial: partial2 };
      yield { type: "text_end", contentIndex: 0, content: "done", partial: finalMsg2 };
      yield { type: "done", reason: "stop", message: finalMsg2 };
    }

    let callCount = 0;
    const llmClient: LlmClient = {
      stream(_req: LlmRequest): LlmStream {
        const gen = callCount === 0 ? llmEvents() : llmEvents2();
        callCount++;
        let finalM: AssistantMessage | null = null;
        return {
          [Symbol.asyncIterator]() {
            return {
              async next() {
                const { done, value } = await gen.next();
                if (done) return { done: true as const, value: undefined };
                if (value.type === "done" || value.type === "error") finalM = value.message;
                return { done: false, value };
              },
              [Symbol.asyncIterator]() {
                return this;
              },
            };
          },
          result: async () => finalM!,
        };
      },
    };

    const searchTool = {
      name: "search",
      description: "search",
      schema: { type: "object" as const, properties: {}, required: [] },
      execute: async () => ({ type: "text" as const, text: "result" }),
    };

    const config: AgentLoopConfig = {
      spec: { ...makeSpec(), tools: [searchTool as any] },
      llmClient,
    };

    const stream = agentLoop(
      [{ role: "user", content: "hi", timestamp: 1 } as any],
      makeContext(),
      config,
    );

    const events = await collectEvents(stream);

    // All message.update events for text content in turn 1
    const turn1Updates = events.filter(
      (e) =>
        e.type === "message.update" &&
        (e as any).event?.type &&
        ["text_start", "text_delta", "text_end"].includes((e as any).event.type),
    );

    // Should have at least the text_delta update (previously dropped for toolUse)
    expect(turn1Updates.length).toBeGreaterThan(0);
  });

  it("text_delta events arrive in sequence before message.end, not as a late burst", async () => {
    const partial0: AssistantMessage = makeAssistantMsg("", "stop");
    const partial1: AssistantMessage = { ...partial0, content: [{ type: "text", text: "A" }] };
    const partial2: AssistantMessage = { ...partial0, content: [{ type: "text", text: "AB" }] };
    const finalMsg: AssistantMessage = { ...partial0, content: [{ type: "text", text: "ABC" }] };

    async function* llmEvents(): AsyncGenerator<LlmStreamEvent> {
      yield { type: "start", partial: partial0 };
      yield { type: "text_start", contentIndex: 0, partial: partial0 };
      yield { type: "text_delta", contentIndex: 0, delta: "A", partial: partial1 };
      yield { type: "text_delta", contentIndex: 0, delta: "B", partial: partial2 };
      yield { type: "text_delta", contentIndex: 0, delta: "C", partial: finalMsg };
      yield { type: "text_end", contentIndex: 0, content: "ABC", partial: finalMsg };
      yield { type: "done", reason: "stop", message: finalMsg };
    }

    const config: AgentLoopConfig = {
      spec: makeSpec(),
      llmClient: makeLlmClient(llmEvents),
    };

    const stream = agentLoop(
      [{ role: "user", content: "hi", timestamp: 1 } as any],
      makeContext(),
      config,
    );

    const events = await collectEvents(stream);

    const types = events.map((e) => e.type);

    // The assistant's message.end is the last one (user's message.end appears earlier).
    const lastEndIdx = types.lastIndexOf("message.end");
    const lastUpdateIdx = types.lastIndexOf("message.update");
    expect(lastEndIdx).toBeGreaterThan(lastUpdateIdx);

    // There should be at least 3 message.update events (one per text_delta)
    const updateCount = types.filter((t) => t === "message.update").length;
    expect(updateCount).toBeGreaterThanOrEqual(3);
  });
});
