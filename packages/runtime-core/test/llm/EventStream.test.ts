/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, it, expect } from "vitest";
import { EventStream, AssistantMessageEventStream } from "../../src/llm/event-stream.js";
import type { AssistantMessage } from "../../src/types/index.js";

describe("EventStream", () => {
  it("should push and iterate events", async () => {
    const stream = new EventStream<number, number>(
      (event) => event === 3,
      (event) => event,
    );

    const events: number[] = [];

    // Consume events
    (async () => {
      for await (const event of stream) {
        events.push(event);
      }
    })();

    // Push events
    stream.push(1);
    stream.push(2);
    stream.push(3);

    // Wait for consumption
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(events).toEqual([1, 2, 3]);
  });

  it("should return final result", async () => {
    const stream = new EventStream<number, string>(
      (event) => event === 3,
      () => "completed",
    );

    stream.push(1);
    stream.push(2);
    stream.push(3);

    const result = await stream.result();
    expect(result).toBe("completed");
  });

  it("should end stream with explicit result", async () => {
    const stream = new EventStream<number, string>(
      () => false,
      () => "",
    );

    const events: number[] = [];

    (async () => {
      for await (const event of stream) {
        events.push(event);
      }
    })();

    stream.push(1);
    stream.push(2);
    stream.end("done");

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(events).toEqual([1, 2]);
    expect(await stream.result()).toBe("done");
  });
});

describe("AssistantMessageEventStream", () => {
  const createTestMessage = (): AssistantMessage => ({
    role: "assistant",
    content: [{ type: "text", text: "Hello" }],
    provider: "test",
    modelId: "test-model",
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 15,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  });

  it("should handle done event", async () => {
    const stream = new AssistantMessageEventStream();
    const message = createTestMessage();

    stream.push({ type: "done", reason: "stop", message });

    const result = await stream.result();
    expect(result).toBe(message);
  });

  it("should handle error event", async () => {
    const stream = new AssistantMessageEventStream();
    const message = createTestMessage();
    const errorMessage: AssistantMessage = {
      ...message,
      stopReason: "error",
    };

    stream.push({ type: "error", reason: "error", message: errorMessage });

    const result = await stream.result();
    expect(result.stopReason).toBe("error");
  });
});
