/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { Type } from "@sinclair/typebox";
import { describe, expect, it, vi } from "vitest";
import { executeToolCalls } from "../../src/executor/tool-executor.js";
import { EventStream } from "../../src/llm/event-stream.js";
import type { AssistantMessage, Message } from "../../src/types/message.types.js";
import type { RuntimeEvent } from "../../src/types/result.types.js";
import type { RuntimeTool, ToolResult } from "../../src/types/tool.types.js";
import {
  createMockTool,
  createMockToolWithError,
  createMockToolWithResult,
} from "../mocks/MockRuntimeTool.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createAgentStream(): EventStream<RuntimeEvent, Message[]> {
  return new EventStream<RuntimeEvent, Message[]>(
    (event) => event.type === "agent_end",
    (event) => (event.type === "agent_end" ? event.messages : []),
  );
}

function createAssistantMessageWithToolCalls(
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
): AssistantMessage {
  return {
    role: "assistant",
    content: toolCalls.map((tc) => ({
      type: "toolCall" as const,
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments,
    })),
    provider: "mock",
    modelId: "mock-model",
    usage: {
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 30,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "toolUse",
    timestamp: Date.now(),
  };
}

async function captureEvents(
  fn: (stream: EventStream<RuntimeEvent, Message[]>) => Promise<void>,
): Promise<RuntimeEvent[]> {
  const stream = createAgentStream();
  const events: RuntimeEvent[] = [];
  const consumePromise = (async () => {
    for await (const event of stream) {
      events.push(event);
    }
  })();

  await fn(stream);
  stream.end([]);
  await consumePromise;

  return events;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("executeToolCalls", () => {
  describe("successful execution", () => {
    it("should execute a single tool call and return a successful result", async () => {
      const tool = createMockTool("my_tool");
      const assistantMessage = createAssistantMessageWithToolCalls([
        { id: "call-1", name: "my_tool", arguments: {} },
      ]);
      const stream = createAgentStream();

      const result = await executeToolCalls([tool], assistantMessage, undefined, stream);

      expect(result.toolResults).toHaveLength(1);
      expect(result.toolResults[0].toolCallId).toBe("call-1");
      expect(result.toolResults[0].toolName).toBe("my_tool");
      expect(result.toolResults[0].isError).toBe(false);
      expect(result.toolResults[0].role).toBe("toolResult");
    });

    it("should return the tool's content in the result message", async () => {
      const tool = createMockToolWithResult("calculator", {
        content: [{ type: "text", text: "Result: 42" }],
        details: { value: 42 },
      });
      const assistantMessage = createAssistantMessageWithToolCalls([
        { id: "call-1", name: "calculator", arguments: {} },
      ]);
      const stream = createAgentStream();

      const result = await executeToolCalls([tool], assistantMessage, undefined, stream);

      expect(result.toolResults[0].content[0]).toMatchObject({
        type: "text",
        text: "Result: 42",
      });
    });

    it("should execute multiple tool calls and return results in order", async () => {
      const toolA = createMockTool("tool_a");
      const toolB = createMockTool("tool_b");
      const assistantMessage = createAssistantMessageWithToolCalls([
        { id: "call-1", name: "tool_a", arguments: {} },
        { id: "call-2", name: "tool_b", arguments: {} },
      ]);
      const stream = createAgentStream();

      const result = await executeToolCalls([toolA, toolB], assistantMessage, undefined, stream);

      expect(result.toolResults).toHaveLength(2);
      expect(result.toolResults[0].toolName).toBe("tool_a");
      expect(result.toolResults[0].toolCallId).toBe("call-1");
      expect(result.toolResults[1].toolName).toBe("tool_b");
      expect(result.toolResults[1].toolCallId).toBe("call-2");
    });

    it("should return no steeringMessages when none are provided", async () => {
      const tool = createMockTool("my_tool");
      const assistantMessage = createAssistantMessageWithToolCalls([
        { id: "call-1", name: "my_tool", arguments: {} },
      ]);
      const stream = createAgentStream();

      const result = await executeToolCalls([tool], assistantMessage, undefined, stream);

      expect(result.steeringMessages).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("should return isError=true when the tool is not found", async () => {
      const assistantMessage = createAssistantMessageWithToolCalls([
        { id: "call-1", name: "nonexistent_tool", arguments: {} },
      ]);
      const stream = createAgentStream();

      const result = await executeToolCalls([], assistantMessage, undefined, stream);

      expect(result.toolResults[0].isError).toBe(true);
    });

    it("should include the missing tool name in the error message content", async () => {
      const assistantMessage = createAssistantMessageWithToolCalls([
        { id: "call-1", name: "missing_tool", arguments: {} },
      ]);
      const stream = createAgentStream();

      const result = await executeToolCalls([], assistantMessage, undefined, stream);

      expect(result.toolResults[0].content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("missing_tool"),
      });
    });

    it("should return isError=true when tool execution throws", async () => {
      const tool = createMockToolWithError("failing_tool", new Error("tool exploded"));
      const assistantMessage = createAssistantMessageWithToolCalls([
        { id: "call-1", name: "failing_tool", arguments: {} },
      ]);
      const stream = createAgentStream();

      const result = await executeToolCalls([tool], assistantMessage, undefined, stream);

      expect(result.toolResults[0].isError).toBe(true);
      expect(result.toolResults[0].content[0]).toMatchObject({
        type: "text",
        text: "tool exploded",
      });
    });

    it("should return isError=true when tool arguments fail schema validation", async () => {
      const strictTool: RuntimeTool = {
        name: "strict_tool",
        label: "Strict Tool",
        description: "Requires a string name",
        parameters: Type.Object({ name: Type.String() }),
        execute: async () => ({ content: [], details: {} }),
      };
      const assistantMessage = createAssistantMessageWithToolCalls([
        { id: "call-1", name: "strict_tool", arguments: { name: 12345 } },
      ]);
      const stream = createAgentStream();

      const result = await executeToolCalls([strictTool], assistantMessage, undefined, stream);

      expect(result.toolResults[0].isError).toBe(true);
    });

    it("should continue executing remaining tools after one fails", async () => {
      const failingTool = createMockToolWithError("fail_tool", new Error("boom"));
      const successTool = createMockTool("ok_tool");
      const assistantMessage = createAssistantMessageWithToolCalls([
        { id: "call-1", name: "fail_tool", arguments: {} },
        { id: "call-2", name: "ok_tool", arguments: {} },
      ]);
      const stream = createAgentStream();

      const result = await executeToolCalls(
        [failingTool, successTool],
        assistantMessage,
        undefined,
        stream,
      );

      expect(result.toolResults).toHaveLength(2);
      expect(result.toolResults[0].isError).toBe(true);
      expect(result.toolResults[1].isError).toBe(false);
    });
  });

  describe("event emission", () => {
    it("should emit tool_execution_start and tool_execution_end for each tool call", async () => {
      const tool = createMockTool("my_tool");
      const assistantMessage = createAssistantMessageWithToolCalls([
        { id: "call-1", name: "my_tool", arguments: { key: "value" } },
      ]);

      const events = await captureEvents(async (stream) => {
        await executeToolCalls([tool], assistantMessage, undefined, stream);
      });

      const startEvent = events.find(
        (e) => e.type === "tool_execution_start" && e.toolName === "my_tool",
      );
      const endEvent = events.find(
        (e) => e.type === "tool_execution_end" && e.toolName === "my_tool",
      );

      expect(startEvent).toBeDefined();
      expect(endEvent).toBeDefined();
    });

    it("should include args in tool_execution_start event", async () => {
      const tool = createMockTool("my_tool");
      const args = { key: "value", count: 3 };
      const assistantMessage = createAssistantMessageWithToolCalls([
        { id: "call-1", name: "my_tool", arguments: args },
      ]);

      const events = await captureEvents(async (stream) => {
        await executeToolCalls([tool], assistantMessage, undefined, stream);
      });

      const startEvent = events.find((e) => e.type === "tool_execution_start");
      expect(startEvent).toMatchObject({ args });
    });

    it("should emit message_start and message_end for each tool result", async () => {
      const tool = createMockTool("my_tool");
      const assistantMessage = createAssistantMessageWithToolCalls([
        { id: "call-1", name: "my_tool", arguments: {} },
      ]);

      const events = await captureEvents(async (stream) => {
        await executeToolCalls([tool], assistantMessage, undefined, stream);
      });

      expect(events.some((e) => e.type === "message_start")).toBe(true);
      expect(events.some((e) => e.type === "message_end")).toBe(true);
    });

    it("should emit tool_execution_update when tool calls onUpdate callback", async () => {
      const partialResult: ToolResult = {
        content: [{ type: "text", text: "still working..." }],
        details: {},
      };
      const streamingTool: RuntimeTool = {
        name: "streaming_tool",
        label: "Streaming Tool",
        description: "Reports progress via onUpdate",
        parameters: Type.Object({}),
        execute: async (_id, _params, _signal, onUpdate) => {
          onUpdate?.(partialResult);
          return { content: [{ type: "text", text: "done" }], details: {} };
        },
      };
      const assistantMessage = createAssistantMessageWithToolCalls([
        { id: "call-1", name: "streaming_tool", arguments: {} },
      ]);

      const events = await captureEvents(async (stream) => {
        await executeToolCalls([streamingTool], assistantMessage, undefined, stream);
      });

      const updateEvent = events.find((e) => e.type === "tool_execution_update");
      expect(updateEvent).toBeDefined();
      expect(updateEvent).toMatchObject({
        type: "tool_execution_update",
        toolName: "streaming_tool",
        partialResult,
      });
    });
  });

  describe("steering messages", () => {
    it("should skip remaining tools when steering messages arrive after first tool", async () => {
      const toolA = createMockTool("tool_a");
      const toolB = createMockTool("tool_b");
      const assistantMessage = createAssistantMessageWithToolCalls([
        { id: "call-1", name: "tool_a", arguments: {} },
        { id: "call-2", name: "tool_b", arguments: {} },
      ]);
      const stream = createAgentStream();

      const steeringMessage: Message = {
        role: "user",
        content: "Please stop and do this instead.",
        timestamp: Date.now(),
      };
      const getSteeringMessages = vi
        .fn()
        .mockResolvedValueOnce([steeringMessage])
        .mockResolvedValue([]);

      const result = await executeToolCalls(
        [toolA, toolB],
        assistantMessage,
        undefined,
        stream,
        getSteeringMessages,
      );

      expect(result.toolResults).toHaveLength(2);
      expect(result.toolResults[0].isError).toBe(false);
      expect(result.toolResults[1].isError).toBe(true);
      expect(result.toolResults[1].content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("Skipped"),
      });
      expect(result.steeringMessages).toEqual([steeringMessage]);
    });

    it("should not skip tools when steering returns empty messages", async () => {
      const toolA = createMockTool("tool_a");
      const toolB = createMockTool("tool_b");
      const assistantMessage = createAssistantMessageWithToolCalls([
        { id: "call-1", name: "tool_a", arguments: {} },
        { id: "call-2", name: "tool_b", arguments: {} },
      ]);
      const stream = createAgentStream();
      const getSteeringMessages = vi.fn().mockResolvedValue([]);

      const result = await executeToolCalls(
        [toolA, toolB],
        assistantMessage,
        undefined,
        stream,
        getSteeringMessages,
      );

      expect(result.toolResults).toHaveLength(2);
      expect(result.toolResults[0].isError).toBe(false);
      expect(result.toolResults[1].isError).toBe(false);
      expect(result.steeringMessages).toBeUndefined();
    });

    it("should emit skipped tool events when a tool is skipped due to steering", async () => {
      const toolA = createMockTool("tool_a");
      const toolB = createMockTool("tool_b");
      const assistantMessage = createAssistantMessageWithToolCalls([
        { id: "call-1", name: "tool_a", arguments: {} },
        { id: "call-2", name: "tool_b", arguments: {} },
      ]);

      const getSteeringMessages = vi
        .fn()
        .mockResolvedValueOnce([{ role: "user", content: "stop", timestamp: Date.now() }])
        .mockResolvedValue([]);

      const events = await captureEvents(async (stream) => {
        await executeToolCalls(
          [toolA, toolB],
          assistantMessage,
          undefined,
          stream,
          getSteeringMessages,
        );
      });

      const skippedStartEvents = events.filter((e) => e.type === "tool_execution_start");
      const skippedEndEvents = events.filter((e) => e.type === "tool_execution_end");

      expect(skippedStartEvents).toHaveLength(2);
      expect(skippedEndEvents).toHaveLength(2);
    });
  });
});
