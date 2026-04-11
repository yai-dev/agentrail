/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { Type } from "@sinclair/typebox";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeToolCalls } from "../src/executor/tool-executor.js";
import { EventStream } from "../src/llm/event-stream.js";
import type { AssistantMessage, Message } from "../src/types/message.types.js";
import type { RuntimeEvent } from "../src/types/result.types.js";
import type {
  RuntimeTool,
  ToolInterceptor,
  ToolValidationContext,
} from "../src/types/tool.types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Returns a real EventStream configured for RuntimeEvent/Message[] along with
 * a mutable `events` array that accumulates every pushed event.
 */
function makeStream(): { stream: EventStream<RuntimeEvent, Message[]>; events: RuntimeEvent[] } {
  const events: RuntimeEvent[] = [];
  // EventStream<RuntimeEvent, Message[]> requires isComplete + extractResult.
  // Use "session.end" as the completion sentinel (same as agent-loop.ts).
  const stream = new EventStream<RuntimeEvent, Message[]>(
    (e) => e.type === "session.end",
    (e) =>
      e.type === "session.end"
        ? (e as Extract<RuntimeEvent, { type: "session.end" }>).messages
        : [],
  );

  // Tap into push by wrapping the stream in a Proxy so we can intercept events.
  const originalPush = stream.push.bind(stream);
  stream.push = (event: RuntimeEvent) => {
    events.push(event);
    originalPush(event);
  };

  return { stream, events };
}

function makeTool(name: string, result = "ok"): RuntimeTool {
  return {
    name,
    label: name,
    description: `Tool ${name}`,
    parameters: Type.Object({ value: Type.String() }),
    execute: vi.fn().mockResolvedValue({
      content: [{ type: "text" as const, text: result }],
      details: {},
    }),
  };
}

function makeAssistantMessage(
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
    provider: "test",
    modelId: "test",
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "toolUse",
    timestamp: Date.now(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("executeToolCalls — ToolInterceptor", () => {
  let stream!: EventStream<RuntimeEvent, Message[]>;
  let collectedEvents!: RuntimeEvent[];

  beforeEach(() => {
    ({ stream, events: collectedEvents } = makeStream());
  });

  it("allow: tool executes normally, tool.before args === rawArgs when no modification", async () => {
    const tool = makeTool("echo");
    const interceptor: ToolInterceptor = {
      onBeforeToolCall: vi.fn().mockResolvedValue({ action: "allow" }),
      onAfterToolCall: vi.fn().mockResolvedValue(undefined),
    };

    const msg = makeAssistantMessage([{ id: "c1", name: "echo", arguments: { value: "hello" } }]);
    await executeToolCalls([tool], msg, undefined, stream, undefined, interceptor);

    const beforeEvent = collectedEvents.find((e) => e.type === "tool.before") as Extract<
      RuntimeEvent,
      { type: "tool.before" }
    >;
    expect(beforeEvent).toBeDefined();
    expect(beforeEvent.args).toEqual({ value: "hello" });
    expect(beforeEvent.rawArgs).toEqual({ value: "hello" });
    expect(beforeEvent.args).toEqual(beforeEvent.rawArgs);

    expect(tool.execute).toHaveBeenCalledOnce();
    expect(interceptor.onAfterToolCall).toHaveBeenCalledOnce();
  });

  it("allow + modified input: tool.before.args reflects modified value, rawArgs keeps original", async () => {
    const tool = makeTool("echo");
    const interceptor: ToolInterceptor = {
      onBeforeToolCall: vi.fn().mockResolvedValue({
        action: "allow",
        input: { value: "SANITIZED" },
      }),
    };

    const msg = makeAssistantMessage([
      { id: "c1", name: "echo", arguments: { value: "sensitive" } },
    ]);
    await executeToolCalls([tool], msg, undefined, stream, undefined, interceptor);

    const beforeEvent = collectedEvents.find((e) => e.type === "tool.before") as Extract<
      RuntimeEvent,
      { type: "tool.before" }
    >;
    expect((beforeEvent.args as Record<string, unknown>).value).toBe("SANITIZED");
    expect((beforeEvent.rawArgs as Record<string, unknown>).value).toBe("sensitive");

    // The tool received the modified input.
    expect(tool.execute).toHaveBeenCalledOnce();
    const callArgs = (tool.execute as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect((callArgs as Record<string, unknown>).value).toBe("SANITIZED");
  });

  it("deny: tool.execute is NOT called; onAfterToolCall is NOT called; result is error", async () => {
    const tool = makeTool("echo");
    const afterSpy = vi.fn();
    const interceptor: ToolInterceptor = {
      onBeforeToolCall: vi.fn().mockResolvedValue({ action: "deny", reason: "not allowed" }),
      onAfterToolCall: afterSpy,
    };

    const msg = makeAssistantMessage([{ id: "c1", name: "echo", arguments: { value: "x" } }]);
    const result = await executeToolCalls([tool], msg, undefined, stream, undefined, interceptor);

    expect(tool.execute).not.toHaveBeenCalled();
    expect(afterSpy).not.toHaveBeenCalled();
    expect(result.toolResults[0].isError).toBe(true);
    expect(result.toolResults[0].content[0]).toMatchObject({ type: "text", text: "not allowed" });
  });

  it("deny: tool.before and tool.after stream events are still emitted", async () => {
    const tool = makeTool("echo");
    const interceptor: ToolInterceptor = {
      onBeforeToolCall: vi.fn().mockResolvedValue({ action: "deny", reason: "blocked" }),
    };

    const msg = makeAssistantMessage([{ id: "c1", name: "echo", arguments: { value: "x" } }]);
    await executeToolCalls([tool], msg, undefined, stream, undefined, interceptor);

    expect(collectedEvents.some((e) => e.type === "tool.before")).toBe(true);
    expect(collectedEvents.some((e) => e.type === "tool.after")).toBe(true);
    const afterEvent = collectedEvents.find((e) => e.type === "tool.after") as Extract<
      RuntimeEvent,
      { type: "tool.after" }
    >;
    expect(afterEvent.isError).toBe(true);
  });

  it("interceptor.onBeforeToolCall throws: error propagates uncaught from executor", async () => {
    const tool = makeTool("echo");
    const interceptor: ToolInterceptor = {
      onBeforeToolCall: vi.fn().mockRejectedValue(new Error("interceptor boom")),
    };

    const msg = makeAssistantMessage([{ id: "c1", name: "echo", arguments: { value: "x" } }]);
    await expect(
      executeToolCalls([tool], msg, undefined, stream, undefined, interceptor),
    ).rejects.toThrow("interceptor boom");

    // tool.execute was NOT called because the before hook threw.
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it("interceptor.onAfterToolCall throws: error propagates uncaught from executor", async () => {
    const tool = makeTool("echo");
    const interceptor: ToolInterceptor = {
      onBeforeToolCall: vi.fn().mockResolvedValue({ action: "allow" }),
      onAfterToolCall: vi.fn().mockRejectedValue(new Error("after boom")),
    };

    const msg = makeAssistantMessage([{ id: "c1", name: "echo", arguments: { value: "x" } }]);
    await expect(
      executeToolCalls([tool], msg, undefined, stream, undefined, interceptor),
    ).rejects.toThrow("after boom");
  });

  it("onAfterToolCall receives correct durationMs (>= 0) and result", async () => {
    const tool = makeTool("echo", "result-text");
    const afterSpy = vi.fn().mockResolvedValue(undefined);
    const interceptor: ToolInterceptor = {
      onAfterToolCall: afterSpy,
    };

    const msg = makeAssistantMessage([{ id: "c1", name: "echo", arguments: { value: "x" } }]);
    await executeToolCalls([tool], msg, undefined, stream, undefined, interceptor);

    expect(afterSpy).toHaveBeenCalledOnce();
    const ctx = afterSpy.mock.calls[0][0];
    expect(ctx.toolName).toBe("echo");
    expect(typeof ctx.durationMs).toBe("number");
    expect(ctx.durationMs).toBeGreaterThanOrEqual(0);
    expect((ctx.result as { content: unknown[] }).content[0]).toMatchObject({
      type: "text",
      text: "result-text",
    });
  });

  it("tool not found: emits tool.before + tool.after error events, no interceptor calls", async () => {
    const afterSpy = vi.fn();
    const interceptor: ToolInterceptor = {
      onBeforeToolCall: vi.fn(),
      onAfterToolCall: afterSpy,
    };

    const msg = makeAssistantMessage([{ id: "c1", name: "ghost", arguments: {} }]);
    const result = await executeToolCalls([], msg, undefined, stream, undefined, interceptor);

    expect(result.toolResults[0].isError).toBe(true);
    expect(interceptor.onBeforeToolCall).not.toHaveBeenCalled();
    expect(afterSpy).not.toHaveBeenCalled();
    expect(collectedEvents.some((e) => e.type === "tool.before")).toBe(true);
    expect(collectedEvents.some((e) => e.type === "tool.after")).toBe(true);
  });

  it("non-object schema: interceptor receives the raw validated value, not a corrupted spread", async () => {
    // Top-level array schema — spreading with { ... } would produce { 0: 'a', 1: 'b' }.
    // The executor must pass the value as-is so non-object schemas are not corrupted.
    const receivedInputs: unknown[] = [];
    const arrayTool: RuntimeTool = {
      name: "arr",
      label: "arr",
      description: "Array tool",
      // Type.Array would normally be used; use an empty schema to keep the test lean.
      parameters: Type.Array(Type.String()),
      execute: vi
        .fn()
        .mockResolvedValue({ content: [{ type: "text" as const, text: "ok" }], details: {} }),
    };
    const interceptor: ToolInterceptor = {
      onBeforeToolCall: vi.fn().mockImplementation(async (ctx) => {
        receivedInputs.push(ctx.input);
        return { action: "allow" as const };
      }),
    };

    const msg = makeAssistantMessage([
      { id: "c1", name: "arr", arguments: ["a", "b"] as unknown as Record<string, unknown> },
    ]);
    await executeToolCalls([arrayTool], msg, undefined, stream, undefined, interceptor);

    // The interceptor should receive exactly what came out of validateToolArguments,
    // not an object-spread of an array.
    expect(Array.isArray(receivedInputs[0])).toBe(true);
    expect(receivedInputs[0]).toEqual(["a", "b"]);
  });

  it("no interceptor: behaves like original executor", async () => {
    const tool = makeTool("echo");
    const msg = makeAssistantMessage([{ id: "c1", name: "echo", arguments: { value: "x" } }]);
    const result = await executeToolCalls([tool], msg, undefined, stream, undefined, undefined);

    expect(tool.execute).toHaveBeenCalledOnce();
    expect(result.toolResults[0].isError).toBe(false);
    const beforeEvent = collectedEvents.find((e) => e.type === "tool.before") as Extract<
      RuntimeEvent,
      { type: "tool.before" }
    >;
    expect(beforeEvent.rawArgs).toEqual({ value: "x" });
  });

  it("interceptor rewrites args to schema-invalid shape: re-validation fails, execute and onAfterToolCall NOT called", async () => {
    const tool = makeTool("echo");
    const afterSpy = vi.fn();
    const interceptor: ToolInterceptor = {
      onBeforeToolCall: vi.fn().mockResolvedValue({
        action: "allow",
        input: { value: 42 }, // number instead of required string
      }),
      onAfterToolCall: afterSpy,
    };

    const msg = makeAssistantMessage([{ id: "c1", name: "echo", arguments: { value: "ok" } }]);
    const result = await executeToolCalls([tool], msg, undefined, stream, undefined, interceptor);

    expect(tool.execute).not.toHaveBeenCalled();
    expect(afterSpy).not.toHaveBeenCalled();
    expect(result.toolResults[0].isError).toBe(true);
    expect(result.toolResults[0].content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Invalid arguments for tool"),
    });
    // tool.before.args should reflect the interceptor-rewritten value
    const beforeEvent = collectedEvents.find((e) => e.type === "tool.before") as Extract<
      RuntimeEvent,
      { type: "tool.before" }
    >;
    expect((beforeEvent.args as Record<string, unknown>).value).toBe(42);
  });
});

describe("executeToolCalls — tool.validate()", () => {
  let stream!: EventStream<RuntimeEvent, Message[]>;
  let collectedEvents!: RuntimeEvent[];

  beforeEach(() => {
    ({ stream, events: collectedEvents } = makeStream());
  });

  it("validate returns { valid: true }: execute is called, onAfterToolCall is called", async () => {
    const tool = makeTool("echo");
    const validateFn = vi.fn().mockResolvedValue({ valid: true });
    (tool as RuntimeTool & { validate: unknown }).validate = validateFn;
    const afterSpy = vi.fn().mockResolvedValue(undefined);
    const interceptor: ToolInterceptor = { onAfterToolCall: afterSpy };

    const msg = makeAssistantMessage([{ id: "c1", name: "echo", arguments: { value: "x" } }]);
    const result = await executeToolCalls([tool], msg, undefined, stream, undefined, interceptor);

    expect(validateFn).toHaveBeenCalledOnce();
    expect(tool.execute).toHaveBeenCalledOnce();
    expect(afterSpy).toHaveBeenCalledOnce();
    expect(result.toolResults[0].isError).toBe(false);
  });

  it("validate returns { valid: false, reason }: error result with prefix, execute NOT called, onAfterToolCall NOT called", async () => {
    const tool = makeTool("echo");
    (tool as RuntimeTool & { validate: unknown }).validate = vi
      .fn()
      .mockResolvedValue({ valid: false, reason: "quota exceeded" });
    const afterSpy = vi.fn();
    const interceptor: ToolInterceptor = { onAfterToolCall: afterSpy };

    const msg = makeAssistantMessage([{ id: "c1", name: "echo", arguments: { value: "x" } }]);
    const result = await executeToolCalls([tool], msg, undefined, stream, undefined, interceptor);

    expect(tool.execute).not.toHaveBeenCalled();
    expect(afterSpy).not.toHaveBeenCalled();
    expect(result.toolResults[0].isError).toBe(true);
    expect(result.toolResults[0].content[0]).toMatchObject({
      type: "text",
      text: "Tool precondition failed: quota exceeded",
    });
  });

  it("validate throws: error is caught and surfaced as precondition failure, execute NOT called", async () => {
    const tool = makeTool("echo");
    (tool as RuntimeTool & { validate: unknown }).validate = vi
      .fn()
      .mockRejectedValue(new Error("unexpected boom"));
    const afterSpy = vi.fn();
    const interceptor: ToolInterceptor = { onAfterToolCall: afterSpy };

    const msg = makeAssistantMessage([{ id: "c1", name: "echo", arguments: { value: "x" } }]);
    const result = await executeToolCalls([tool], msg, undefined, stream, undefined, interceptor);

    expect(tool.execute).not.toHaveBeenCalled();
    expect(afterSpy).not.toHaveBeenCalled();
    expect(result.toolResults[0].isError).toBe(true);
    expect(result.toolResults[0].content[0]).toMatchObject({
      type: "text",
      text: "Tool precondition failed: unexpected boom",
    });
  });

  it("validate failure: tool.before and tool.after are still emitted as a pair", async () => {
    const tool = makeTool("echo");
    (tool as RuntimeTool & { validate: unknown }).validate = vi
      .fn()
      .mockResolvedValue({ valid: false, reason: "blocked" });

    const msg = makeAssistantMessage([{ id: "c1", name: "echo", arguments: { value: "x" } }]);
    await executeToolCalls([tool], msg, undefined, stream);

    expect(collectedEvents.some((e) => e.type === "tool.before")).toBe(true);
    expect(collectedEvents.some((e) => e.type === "tool.after")).toBe(true);
    const afterEvent = collectedEvents.find((e) => e.type === "tool.after") as Extract<
      RuntimeEvent,
      { type: "tool.after" }
    >;
    expect(afterEvent.isError).toBe(true);
  });

  it("validate is undefined: behavior unchanged — execute is called normally", async () => {
    const tool = makeTool("echo");
    expect(tool.validate).toBeUndefined();

    const msg = makeAssistantMessage([{ id: "c1", name: "echo", arguments: { value: "x" } }]);
    const result = await executeToolCalls([tool], msg, undefined, stream);

    expect(tool.execute).toHaveBeenCalledOnce();
    expect(result.toolResults[0].isError).toBe(false);
  });

  it("validate runs on effectiveArgs (post-interceptor), not original args", async () => {
    const tool = makeTool("echo");
    const receivedParams: unknown[] = [];
    (
      tool as RuntimeTool & {
        validate: (p: unknown, ctx: ToolValidationContext) => { valid: true };
      }
    ).validate = vi.fn().mockImplementation((params: unknown) => {
      receivedParams.push(params);
      return { valid: true as const };
    });
    const interceptor: ToolInterceptor = {
      onBeforeToolCall: vi
        .fn()
        .mockResolvedValue({ action: "allow", input: { value: "MODIFIED" } }),
    };

    const msg = makeAssistantMessage([
      { id: "c1", name: "echo", arguments: { value: "original" } },
    ]);
    await executeToolCalls([tool], msg, undefined, stream, undefined, interceptor);

    expect(receivedParams[0]).toEqual({ value: "MODIFIED" });
  });
});
