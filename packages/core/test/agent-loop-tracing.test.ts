/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/**
 * Tests for the chainId/depth/turnIndex tracing fields on RuntimeEvent.
 *
 * Covers:
 *  - All pre-loop events carry turnIndex=0
 *  - runLoop events carry correct turnIndex (0-based, equals turnCount-1)
 *  - chainId from AgentRunOptions is propagated to all events
 *  - depth from AgentRunOptions is propagated to all events
 *  - When no chainId is supplied a UUID is auto-generated and consistent
 */

import { describe, expect, it } from "vitest";
import { defineAgent } from "../src/agent/define-agent.js";
import type { AgentLoopConfig, InternalContext, InternalSpec } from "../src/agent/agent-loop.js";
import { agentLoop } from "../src/agent/agent-loop.js";
import type { LlmClient, LlmRequest, LlmStream } from "../src/interfaces/llm-client.js";
import type { AssistantMessage } from "../src/types/message.types.js";
import type { LlmStreamEvent, RuntimeEvent } from "../src/types/result.types.js";
import type { Usage } from "../src/types/usage.types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ZERO_USAGE: Usage = {
  inputTokens: 1,
  outputTokens: 1,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function makeAssistantMsg(text = "ok"): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason: "stop",
    provider: "mock",
    modelId: "mock",
    usage: ZERO_USAGE,
    timestamp: Date.now(),
  } as unknown as AssistantMessage;
}

function makeLlmClient(msg: AssistantMessage): LlmClient {
  return {
    stream(_req: LlmRequest): LlmStream {
      async function* events(): AsyncGenerator<LlmStreamEvent> {
        yield { type: "done", reason: "stop", message: msg };
      }
      const gen = events();
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              return gen.next();
            },
            [Symbol.asyncIterator]() {
              return this;
            },
          };
        },
        result: async () => msg,
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

function makeContext(overrides?: Partial<InternalContext>): InternalContext {
  return { conversationId: "test-conv", messages: [], ...overrides };
}

async function collectEvents(stream: AsyncIterable<RuntimeEvent>): Promise<RuntimeEvent[]> {
  const events: RuntimeEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

const USER_MSG = { role: "user" as const, content: "hi", timestamp: 1 } as any;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("agent-loop – tracing fields", () => {
  it("all events carry chainId, depth, and turnIndex", async () => {
    const msg = makeAssistantMsg();
    const stream = agentLoop([USER_MSG], makeContext({ chainId: "c1", depth: 2 }), {
      spec: makeSpec(),
      llmClient: makeLlmClient(msg),
    });

    const events = await collectEvents(stream);
    expect(events.length).toBeGreaterThan(0);

    for (const e of events) {
      expect(e.chainId).toBe("c1");
      expect(e.depth).toBe(2);
      expect(typeof e.turnIndex).toBe("number");
    }
  });

  it("session.start, initial turn.start and prompt message.* carry turnIndex=0", async () => {
    const msg = makeAssistantMsg();
    const stream = agentLoop([USER_MSG], makeContext({ chainId: "c1" }), {
      spec: makeSpec(),
      llmClient: makeLlmClient(msg),
    });

    const events = await collectEvents(stream);

    const sessionStart = events.find((e) => e.type === "session.start");
    const firstTurnStart = events.find((e) => e.type === "turn.start");
    const promptMessageStart = events.find((e) => e.type === "message.start");

    expect(sessionStart?.turnIndex).toBe(0);
    expect(firstTurnStart?.turnIndex).toBe(0);
    expect(promptMessageStart?.turnIndex).toBe(0);
  });

  it("events within the first runLoop turn carry turnIndex=0", async () => {
    const msg = makeAssistantMsg();
    const stream = agentLoop([USER_MSG], makeContext({ chainId: "c1" }), {
      spec: makeSpec(),
      llmClient: makeLlmClient(msg),
    });

    const events = await collectEvents(stream);

    // All events in a single-turn run should have turnIndex=0
    const uniqueIndices = [...new Set(events.map((e) => e.turnIndex))];
    expect(uniqueIndices).toEqual([0]);
  });

  it("chainId defaults to a stable UUID when not provided", async () => {
    const msg = makeAssistantMsg();
    const stream = agentLoop([USER_MSG], makeContext(), {
      spec: makeSpec(),
      llmClient: makeLlmClient(msg),
    });

    const events = await collectEvents(stream);
    const chainIds = [...new Set(events.map((e) => e.chainId))];

    // All events share the same auto-generated chainId
    expect(chainIds).toHaveLength(1);
    // Should look like a UUID
    expect(chainIds[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("depth defaults to 0 when not provided", async () => {
    const msg = makeAssistantMsg();
    const stream = agentLoop([USER_MSG], makeContext(), {
      spec: makeSpec(),
      llmClient: makeLlmClient(msg),
    });

    const events = await collectEvents(stream);
    for (const e of events) {
      expect(e.depth).toBe(0);
    }
  });

  it("agent.invoke propagates chainId and depth from AgentRunOptions", async () => {
    const agent = defineAgent({
      id: "a",
      name: "A",
      model: "mock:m",
      prompt: "p",
      llmClient: makeLlmClient(makeAssistantMsg()),
    });

    const events: RuntimeEvent[] = [];
    const stream = agent.stream("hi", { chainId: "route-trace-id", depth: 1 });
    for await (const e of stream) {
      events.push(e);
    }

    for (const e of events) {
      expect(e.chainId).toBe("route-trace-id");
      expect(e.depth).toBe(1);
    }
  });
});
