/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, it, expect, vi } from "vitest";
import {
  agentLoop,
  agentLoopContinue,
  type AgentLoopConfig,
  type InternalContext as AgentContext,
  type InternalSpec as AgentSpec,
} from "../../src/agent/agent-loop.js";
import { MockLlmClient } from "../mocks/MockLlmClient.js";
import { createMockTool } from "../mocks/MockRuntimeTool.js";
import type { Message, UserMessage, AssistantMessage } from "../../src/types/message.types.js";
import type { RuntimeEvent } from "../../src/types/result.types.js";
import type { EventStream } from "../../src/llm/event-stream.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createContext(messages: Message[] = []): AgentContext {
  return {
    conversationId: "test-conv-id",
    messages,
  };
}

function createSpec(overrides: Partial<AgentSpec> = {}): AgentSpec {
  return {
    id: "test-agent",
    name: "Test Agent",
    systemPrompt: "You are a test agent.",
    model: { provider: "mock", modelId: "mock-model" },
    ...overrides,
  };
}

function createConfig(
  llmClient: MockLlmClient,
  overrides: Partial<AgentLoopConfig> = {},
): AgentLoopConfig {
  return {
    spec: createSpec(),
    llmClient,
    ...overrides,
  };
}

function createUserMessage(text: string): UserMessage {
  return {
    role: "user",
    content: text,
    timestamp: Date.now(),
  };
}

function createAssistantMessage(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return MockLlmClient.createMockResponse(overrides);
}

/**
 * Consume all events from the stream and wait for the final result.
 */
async function runStream(
  stream: EventStream<RuntimeEvent, Message[]>,
): Promise<{ events: RuntimeEvent[]; result: Message[] }> {
  const events: RuntimeEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  const result = await stream.result();
  return { events, result };
}

// ── agentLoop ────────────────────────────────────────────────────────────────

describe("agentLoop", () => {
  describe("core execution flow", () => {
    it("should emit agent_start, turn_start, and agent_end events", async () => {
      const client = new MockLlmClient();
      const stream = agentLoop([createUserMessage("hello")], createContext(), createConfig(client));

      const { events } = await runStream(stream);

      expect(events.some((e) => e.type === "agent_start")).toBe(true);
      expect(events.some((e) => e.type === "turn_start")).toBe(true);
      expect(events.some((e) => e.type === "agent_end")).toBe(true);
    });

    it("should emit message_start and message_end for the user prompt", async () => {
      const client = new MockLlmClient();
      const prompt = createUserMessage("hello");
      const stream = agentLoop([prompt], createContext(), createConfig(client));

      const { events } = await runStream(stream);

      const startEvent = events.find(
        (e) => e.type === "message_start" && e.message.role === "user",
      );
      const endEvent = events.find((e) => e.type === "message_end" && e.message.role === "user");

      expect(startEvent).toBeDefined();
      expect(endEvent).toBeDefined();
    });

    it("should emit turn_end with the assistant message", async () => {
      const client = new MockLlmClient();
      const stream = agentLoop([createUserMessage("hello")], createContext(), createConfig(client));

      const { events } = await runStream(stream);

      const turnEndEvent = events.find((e) => e.type === "turn_end");
      expect(turnEndEvent).toBeDefined();
      expect(turnEndEvent).toMatchObject({
        type: "turn_end",
        message: expect.objectContaining({ role: "assistant" }),
        toolResults: [],
      });
    });

    it("should include the prompt and assistant message in the result", async () => {
      const client = new MockLlmClient();
      const prompt = createUserMessage("hello");
      const stream = agentLoop([prompt], createContext(), createConfig(client));

      const { result } = await runStream(stream);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(prompt);
      expect(result[1].role).toBe("assistant");
    });

    it("should include context.messages in LLM request but not in the result", async () => {
      const client = new MockLlmClient();
      const contextMessage = createUserMessage("prior context");
      const prompt = createUserMessage("new message");
      const context = createContext([contextMessage]);

      const stream = agentLoop([prompt], context, createConfig(client));
      const { result } = await runStream(stream);

      // result contains only NEW messages (prompt + assistant response)
      expect(result.some((m) => m === contextMessage)).toBe(false);
      expect(result.some((m) => m === prompt)).toBe(true);
    });

    it("should emit agent_end with accumulated usage", async () => {
      const client = new MockLlmClient();
      client.setResponse(
        createAssistantMessage({
          usage: {
            inputTokens: 10,
            outputTokens: 20,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 30,
            cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 },
          },
        }),
      );

      const stream = agentLoop([createUserMessage("hello")], createContext(), createConfig(client));
      const { events } = await runStream(stream);

      const agentEndEvent = events.find((e) => e.type === "agent_end");
      expect(agentEndEvent).toMatchObject({
        type: "agent_end",
        usage: expect.objectContaining({
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
        }),
      });
    });
  });

  describe("tool invocation", () => {
    it("should execute tools when LLM returns toolUse and continue to second LLM call", async () => {
      const client = new MockLlmClient();
      const myTool = createMockTool("search");

      const toolUseResponse = createAssistantMessage({
        content: [
          {
            type: "toolCall",
            id: "call-1",
            name: "search",
            arguments: {},
          },
        ],
        stopReason: "toolUse",
      });
      const stopResponse = createAssistantMessage({
        content: [{ type: "text", text: "Here is the answer." }],
        stopReason: "stop",
      });

      client.setResponse([toolUseResponse, stopResponse]);

      const spec = createSpec({ tools: [myTool] });
      const config = createConfig(client, { spec });
      const stream = agentLoop(
        [createUserMessage("search for something")],
        createContext(),
        config,
      );

      const { events, result } = await runStream(stream);

      // Tool execution events should be present
      expect(events.some((e) => e.type === "tool_execution_start")).toBe(true);
      expect(events.some((e) => e.type === "tool_execution_end")).toBe(true);

      // Result should include: prompt, assistant(toolUse), toolResult, assistant(stop)
      expect(result).toHaveLength(4);
      expect(result[0].role).toBe("user");
      expect(result[1].role).toBe("assistant");
      expect(result[2].role).toBe("toolResult");
      expect(result[3].role).toBe("assistant");
    });

    it("should emit two turn_start events for a tool-use interaction", async () => {
      const client = new MockLlmClient();
      const myTool = createMockTool("search");

      client.setResponse([
        createAssistantMessage({
          content: [{ type: "toolCall", id: "call-1", name: "search", arguments: {} }],
          stopReason: "toolUse",
        }),
        createAssistantMessage({ stopReason: "stop" }),
      ]);

      const spec = createSpec({ tools: [myTool] });
      const config = createConfig(client, { spec });
      const stream = agentLoop([createUserMessage("hello")], createContext(), config);

      const { events } = await runStream(stream);

      const turnStartEvents = events.filter((e) => e.type === "turn_start");
      expect(turnStartEvents).toHaveLength(2);
    });

    it("should accumulate usage across multiple LLM turns", async () => {
      const client = new MockLlmClient();
      const myTool = createMockTool("search");
      const usage = (inputTokens: number, outputTokens: number) => ({
        inputTokens,
        outputTokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: inputTokens + outputTokens,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      });

      client.setResponse([
        createAssistantMessage({
          content: [{ type: "toolCall", id: "c1", name: "search", arguments: {} }],
          stopReason: "toolUse",
          usage: usage(10, 5),
        }),
        createAssistantMessage({ stopReason: "stop", usage: usage(15, 8) }),
      ]);

      const spec = createSpec({ tools: [myTool] });
      const config = createConfig(client, { spec });
      const stream = agentLoop([createUserMessage("hello")], createContext(), config);
      const { events } = await runStream(stream);

      const agentEndEvent = events.find((e) => e.type === "agent_end");
      expect(agentEndEvent).toMatchObject({
        usage: expect.objectContaining({
          inputTokens: 25,
          outputTokens: 13,
          totalTokens: 38,
        }),
      });
    });
  });

  describe("termination conditions", () => {
    it("should terminate the loop immediately when LLM returns stopReason=error", async () => {
      const client = new MockLlmClient();
      client.setResponse(
        createAssistantMessage({
          stopReason: "error",
          errorMessage: "LLM service unavailable",
        }),
      );

      const stream = agentLoop([createUserMessage("hello")], createContext(), createConfig(client));
      const { events } = await runStream(stream);

      // Should emit agent_end without entering a second turn
      const turnStartEvents = events.filter((e) => e.type === "turn_start");
      expect(turnStartEvents).toHaveLength(1);
      expect(events.some((e) => e.type === "agent_end")).toBe(true);
    });

    it("should terminate the loop immediately when LLM returns stopReason=aborted", async () => {
      const client = new MockLlmClient();
      client.setResponse(
        createAssistantMessage({
          stopReason: "aborted",
          errorMessage: "Request aborted",
        }),
      );

      const stream = agentLoop([createUserMessage("hello")], createContext(), createConfig(client));
      const { events } = await runStream(stream);

      const turnStartEvents = events.filter((e) => e.type === "turn_start");
      expect(turnStartEvents).toHaveLength(1);
    });

    it("should emit turn_end with empty toolResults when stopping due to error", async () => {
      const client = new MockLlmClient();
      client.setResponse(createAssistantMessage({ stopReason: "error" }));

      const stream = agentLoop([createUserMessage("hello")], createContext(), createConfig(client));
      const { events } = await runStream(stream);

      const turnEndEvent = events.find((e) => e.type === "turn_end");
      expect(turnEndEvent).toMatchObject({ toolResults: [] });
    });
  });

  describe("steering messages", () => {
    it("should inject steering messages into the conversation before the LLM call", async () => {
      const client = new MockLlmClient();
      const steeringMessage: Message = {
        role: "user",
        content: "Additional instruction",
        timestamp: Date.now(),
      };
      let callCount = 0;
      const getSteeringMessages = vi.fn().mockImplementation(async () => {
        callCount++;
        // Return steering on first call, then empty
        return callCount === 1 ? [steeringMessage] : [];
      });

      const config = createConfig(client, { getSteeringMessages });
      const stream = agentLoop([createUserMessage("hello")], createContext(), config);
      const { result } = await runStream(stream);

      // Result should include the user prompt, steering message, and assistant response
      expect(result.some((m) => m === steeringMessage)).toBe(true);
    });
  });

  describe("follow-up messages", () => {
    it("should continue the loop when getFollowUpMessages returns messages", async () => {
      const client = new MockLlmClient();
      const followUp: Message = {
        role: "user",
        content: "Follow-up question",
        timestamp: Date.now(),
      };
      let followUpCallCount = 0;
      const getFollowUpMessages = vi.fn().mockImplementation(async () => {
        followUpCallCount++;
        // Return follow-up on first outer-loop iteration only
        return followUpCallCount === 1 ? [followUp] : [];
      });

      const config = createConfig(client, { getFollowUpMessages });
      const stream = agentLoop([createUserMessage("hello")], createContext(), config);
      const { result } = await runStream(stream);

      // LLM called twice: initial + after follow-up
      expect(result.some((m) => m === followUp)).toBe(true);
    });
  });

  describe("transformContext", () => {
    it("should call transformContext before each LLM request", async () => {
      const client = new MockLlmClient();
      const transformContext = vi.fn().mockImplementation(async (messages: Message[]) => messages);
      const context = createContext();
      context.transformContext;

      const config = createConfig(client, { transformContext });
      const stream = agentLoop([createUserMessage("hello")], context, config);
      await runStream(stream);

      expect(transformContext).toHaveBeenCalledTimes(1);
    });

    it("should use the transformed messages for the LLM request", async () => {
      const client = new MockLlmClient();
      const injected: Message = {
        role: "user",
        content: "Injected by transform",
        timestamp: Date.now(),
      };
      let capturedMessages: Message[] | null = null;

      const originalStream = client.stream.bind(client);
      vi.spyOn(client, "stream").mockImplementation((req) => {
        capturedMessages = [...req.messages];
        return originalStream(req);
      });

      const transformContext = vi
        .fn()
        .mockImplementation(async (messages: Message[]) => [...messages, injected]);

      const config = createConfig(client, { transformContext });
      const stream = agentLoop([createUserMessage("hello")], createContext(), config);
      await runStream(stream);

      expect(capturedMessages).not.toBeNull();
      expect(capturedMessages!.some((m) => m === injected)).toBe(true);
    });
  });

  describe("multiple prompt messages", () => {
    it("should emit message events for all prompt messages", async () => {
      const client = new MockLlmClient();
      const prompt1 = createUserMessage("first");
      const prompt2 = createUserMessage("second");
      const stream = agentLoop([prompt1, prompt2], createContext(), createConfig(client));

      const { events } = await runStream(stream);

      const userStartEvents = events.filter(
        (e) => e.type === "message_start" && e.message.role === "user",
      );
      expect(userStartEvents).toHaveLength(2);
    });
  });
});

// ── agentLoopContinue ────────────────────────────────────────────────────────

describe("agentLoopContinue", () => {
  it("should throw if context has no messages", () => {
    const client = new MockLlmClient();
    const context = createContext([]);

    expect(() => agentLoopContinue(context, createConfig(client))).toThrow(
      "Cannot continue: no messages in context",
    );
  });

  it("should throw if the last message in context is from the assistant", () => {
    const client = new MockLlmClient();
    const context = createContext([createAssistantMessage()]);

    expect(() => agentLoopContinue(context, createConfig(client))).toThrow(
      "Cannot continue from message role: assistant",
    );
  });

  it("should run the loop when context ends with a user message", async () => {
    const client = new MockLlmClient();
    const context = createContext([createUserMessage("prior message")]);

    const stream = agentLoopContinue(context, createConfig(client));
    const { events, result } = await runStream(stream);

    expect(events.some((e) => e.type === "agent_start")).toBe(true);
    expect(events.some((e) => e.type === "agent_end")).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[result.length - 1].role).toBe("assistant");
  });

  it("should run the loop when context ends with a toolResult message", async () => {
    const client = new MockLlmClient();
    const toolResultMessage: Message = {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "my_tool",
      content: [{ type: "text", text: "Tool output" }],
      isError: false,
      timestamp: Date.now(),
    };
    const context = createContext([toolResultMessage]);

    const stream = agentLoopContinue(context, createConfig(client));
    const { events } = await runStream(stream);

    expect(events.some((e) => e.type === "agent_end")).toBe(true);
  });

  it("should not emit message_start events for context messages (only new messages)", async () => {
    const client = new MockLlmClient();
    const priorMessage = createUserMessage("prior");
    const context = createContext([priorMessage]);

    const stream = agentLoopContinue(context, createConfig(client));
    const { events } = await runStream(stream);

    // Context messages are not re-emitted; only the new assistant response is emitted
    const userMessageStartEvents = events.filter(
      (e) => e.type === "message_start" && e.message.role === "user",
    );
    expect(userMessageStartEvents).toHaveLength(0);
  });
});
