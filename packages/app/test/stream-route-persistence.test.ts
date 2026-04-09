/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/**
 * Tests for incremental session persistence in the streaming route.
 *
 * Verifies that appendMessages is called once per internal reasoning turn
 * (turn.complete), SSE-first, rather than once at the end of the full request.
 * Also covers flush-failure drop semantics.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStreamRoute } from "../src/routes/stream-route.js";
import type { AgentrailSessionStore, AgentrailProfile } from "../src/host/types.js";
import type { Agent, AgentStream, RuntimeEvent, Message, Usage } from "@agentrail/core";
import type { AssistantMessage, ToolResultMessage } from "@agentrail/core";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = "tenant-1";
const USER_ID = "user-1";
const SESSION_ID = "test-session";
const AGENT_ID = "test-agent";

const ZERO_USAGE: Usage = {
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 15,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function makeUserMsg(): Message {
  return { role: "user", content: "hello", timestamp: 1 } as Message;
}

function makeAssistantMsg(hasToolCall = false): AssistantMessage {
  return {
    role: "assistant",
    content: hasToolCall
      ? [{ type: "toolCall", id: "tc1", name: "search", arguments: {} }]
      : [{ type: "text", text: "done" }],
    stopReason: hasToolCall ? "toolUse" : "stop",
    provider: "mock",
    modelId: "mock",
    usage: ZERO_USAGE,
    timestamp: 2,
  } as unknown as AssistantMessage;
}

function makeToolResultMsg(): ToolResultMessage {
  return {
    role: "toolResult",
    content: [{ type: "toolResult", toolCallId: "tc1", content: "result" }],
    timestamp: 3,
  } as unknown as ToolResultMessage;
}

/** Creates an AgentStream that simulates a 2-turn conversation. */
function makeTwoTurnStream(): AgentStream {
  const userMsg = makeUserMsg();
  const assistantMsg1 = makeAssistantMsg(true); // turn 1: makes a tool call
  const toolResultMsg = makeToolResultMsg();
  const assistantMsg2 = makeAssistantMsg(false); // turn 2: final response

  async function* events(): AsyncGenerator<RuntimeEvent> {
    yield { type: "session.start" };
    yield { type: "turn.start" };
    yield { type: "message.start", message: userMsg };
    yield { type: "message.end", message: userMsg };
    yield { type: "message.start", message: assistantMsg1 };
    yield { type: "message.end", message: assistantMsg1 };
    yield { type: "tool.before", toolCallId: "tc1", toolName: "search", args: {} };
    yield { type: "tool.after", toolCallId: "tc1", toolName: "search", result: "result", isError: false };
    yield { type: "message.start", message: toolResultMsg };
    yield { type: "message.end", message: toolResultMsg };
    yield { type: "turn.complete", message: assistantMsg1, toolResults: [toolResultMsg] };
    yield { type: "turn.start" };
    yield { type: "message.start", message: assistantMsg2 };
    yield { type: "message.end", message: assistantMsg2 };
    yield { type: "turn.complete", message: assistantMsg2, toolResults: [] };
    yield {
      type: "session.end",
      messages: [userMsg, assistantMsg1, toolResultMsg, assistantMsg2],
      usage: ZERO_USAGE,
    };
  }

  return {
    [Symbol.asyncIterator]: () => events(),
    result: () =>
      Promise.resolve({
        text: "done",
        messages: [],
        usage: ZERO_USAGE,
        stopReason: "stop",
      } as any),
  };
}

function makeSessionStore(overrides: Partial<AgentrailSessionStore> = {}): AgentrailSessionStore {
  return {
    getOrCreate: vi.fn().mockResolvedValue({
      sessionId: SESSION_ID,
      sessionRef: `${TENANT_ID}:${SESSION_ID}`,
    }),
    loadMessages: vi.fn().mockResolvedValue([]),
    loadMessagesWithBudget: vi.fn().mockResolvedValue([]),
    loadAllMessages: vi.fn().mockResolvedValue([]),
    appendMessages: vi.fn().mockResolvedValue(undefined),
    recordTurn: vi.fn().mockResolvedValue(undefined),
    compactIfNeeded: vi.fn().mockResolvedValue(false),
    ping: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeProfile(agentStream: AgentStream): AgentrailProfile {
  const agent: Agent = {
    id: AGENT_ID,
    name: AGENT_ID,
    stream: () => agentStream,
    invoke: vi.fn(),
    batch: vi.fn(),
    withTools: vi.fn(),
  };
  return {
    id: AGENT_ID,
    name: AGENT_ID,
    createAgent: vi.fn().mockResolvedValue(agent),
    getContextProviders: vi.fn().mockResolvedValue([]),
  } as unknown as AgentrailProfile;
}

async function drainResponse(res: Response): Promise<void> {
  const reader = res.body!.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

async function makeRequest(route: ReturnType<typeof createStreamRoute>): Promise<Response> {
  const req = new Request("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      userId: USER_ID,
      agentId: AGENT_ID,
      message: "hello",
    }),
  });
  const res = await route.fetch(req);
  await drainResponse(res);
  return res;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("stream-route – incremental persistence", () => {
  it("calls appendMessages once per turn.complete, then recordTurn once after session.end", async () => {
    const callLog: string[] = [];
    const sessionStore = makeSessionStore({
      appendMessages: vi.fn().mockImplementation(async () => {
        callLog.push("appendMessages");
      }),
      recordTurn: vi.fn().mockImplementation(async () => {
        callLog.push("recordTurn");
      }),
    });

    const route = createStreamRoute({
      defaultAgentId: AGENT_ID,
      sessionStore,
      summarize: async () => "",
      compaction: { triggerTokens: 999_999, minMessages: 9999 },
      resolveProfile: vi.fn().mockResolvedValue(makeProfile(makeTwoTurnStream())),
    });

    await makeRequest(route);

    expect(callLog).toEqual(["appendMessages", "appendMessages", "recordTurn"]);
  });

  it("first turn batch contains user+assistant+toolResult, second batch contains only final assistant", async () => {
    const batches: Message[][] = [];
    const sessionStore = makeSessionStore({
      appendMessages: vi.fn().mockImplementation(async (_tid, _sid, msgs: Message[]) => {
        batches.push(msgs);
      }),
    });

    const route = createStreamRoute({
      defaultAgentId: AGENT_ID,
      sessionStore,
      summarize: async () => "",
      compaction: { triggerTokens: 999_999, minMessages: 9999 },
      resolveProfile: vi.fn().mockResolvedValue(makeProfile(makeTwoTurnStream())),
    });

    await makeRequest(route);

    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(3); // user + assistant1 + toolResult
    expect(batches[0]![0]!.role).toBe("user");
    expect(batches[0]![1]!.role).toBe("assistant");
    expect(batches[0]![2]!.role).toBe("toolResult");
    expect(batches[1]).toHaveLength(1); // final assistant only
    expect(batches[1]![0]!.role).toBe("assistant");
  });

  it("onTurnPersisted is called after all flushes succeed", async () => {
    const onTurnPersisted = vi.fn().mockResolvedValue(undefined);
    const route = createStreamRoute({
      defaultAgentId: AGENT_ID,
      sessionStore: makeSessionStore(),
      summarize: async () => "",
      compaction: { triggerTokens: 999_999, minMessages: 9999 },
      resolveProfile: vi.fn().mockResolvedValue(makeProfile(makeTwoTurnStream())),
      onTurnPersisted,
    });

    await makeRequest(route);

    expect(onTurnPersisted).toHaveBeenCalledOnce();
  });

  it("recordTurn is NOT called when session.end is never received (stream ends early)", async () => {
    const sessionStore = makeSessionStore();

    async function* earlyEndStream(): AsyncGenerator<RuntimeEvent> {
      yield { type: "session.start" };
      yield { type: "turn.start" };
      // stream ends without session.end
    }

    const agentStream: AgentStream = {
      [Symbol.asyncIterator]: () => earlyEndStream(),
      result: () => Promise.resolve({ text: "", messages: [], usage: ZERO_USAGE, stopReason: "stop" } as any),
    };

    const route = createStreamRoute({
      defaultAgentId: AGENT_ID,
      sessionStore,
      summarize: async () => "",
      compaction: { triggerTokens: 999_999, minMessages: 9999 },
      resolveProfile: vi.fn().mockResolvedValue(makeProfile(agentStream)),
    });

    await makeRequest(route);

    expect(sessionStore.recordTurn).not.toHaveBeenCalled();
  });
});

describe("stream-route – flush failure drop semantics", () => {
  it("a failed flush is permanently dropped; the next turn only gets its own messages", async () => {
    const batches: Message[][] = [];
    let callCount = 0;
    const onTurnPersisted = vi.fn();

    const sessionStore = makeSessionStore({
      appendMessages: vi.fn().mockImplementation(async (_tid, _sid, msgs: Message[]) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("disk full");
        }
        batches.push(msgs);
      }),
      recordTurn: vi.fn().mockResolvedValue(undefined),
    });

    const route = createStreamRoute({
      defaultAgentId: AGENT_ID,
      sessionStore,
      summarize: async () => "",
      compaction: { triggerTokens: 999_999, minMessages: 9999 },
      resolveProfile: vi.fn().mockResolvedValue(makeProfile(makeTwoTurnStream())),
      onTurnPersisted,
    });

    await makeRequest(route);

    // Second batch should only contain messages from turn 2, not a retry of turn 1.
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
    expect(batches[0]![0]!.role).toBe("assistant");

    // recordTurn still called for billing — but conversation state is incomplete.
    expect(sessionStore.recordTurn).toHaveBeenCalledOnce();
    // onTurnPersisted must NOT fire: at least one flush failed, so the on-disk
    // state does not reflect the full conversation.
    expect(onTurnPersisted).not.toHaveBeenCalled();
  });

  it("a failed flush does not break the SSE stream", async () => {
    const sessionStore = makeSessionStore({
      appendMessages: vi.fn().mockRejectedValue(new Error("storage error")),
    });

    const route = createStreamRoute({
      defaultAgentId: AGENT_ID,
      sessionStore,
      summarize: async () => "",
      compaction: { triggerTokens: 999_999, minMessages: 9999 },
      resolveProfile: vi.fn().mockResolvedValue(makeProfile(makeTwoTurnStream())),
    });

    const req = new Request("http://localhost/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: TENANT_ID, userId: USER_ID, agentId: AGENT_ID, message: "hi" }),
    });

    const res = await route.fetch(req);
    expect(res.status).toBe(200);

    // Drain the body — should not throw even with storage failures
    await drainResponse(res);
  });
});

// ─── Abort race-condition coverage ────────────────────────────────────────────
//
// These tests drive a real AbortSignal through the route to verify the
// bottom-of-loop abort check (stream-route.ts:491) behaves correctly.
//
//  Case A — abort fires inside the turn.complete flush (after the event has
//            been dequeued and processed): the flush must complete, but
//            session.end is skipped so capturedUsage stays null.
//
//  Case B — abort fires while turn.complete is still "queued" (i.e. the
//            generator hasn't been resumed to produce it yet): the flush must
//            never run and no messages are persisted.

describe("stream-route – abort race condition", () => {
  function makeReqWithSignal(signal: AbortSignal): Request {
    return new Request("http://localhost/", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: TENANT_ID, userId: USER_ID, agentId: AGENT_ID, message: "hello" }),
    });
  }

  it("Case A: abort fires inside flush — turn is persisted, session.end skipped, onTurnPersisted not called", async () => {
    const reqAbortCtrl = new AbortController();
    const onTurnPersisted = vi.fn();

    const sessionStore = makeSessionStore({
      // Abort the request synchronously inside the flush callback.  The
      // route's internal AbortController listens to c.req.raw.signal so it
      // will be aborted before the bottom-of-loop check runs.
      appendMessages: vi.fn().mockImplementation(async () => {
        reqAbortCtrl.abort();
      }),
    });

    const assistantMsg = makeAssistantMsg(false);

    async function* streamWithSessionEnd(): AsyncGenerator<RuntimeEvent> {
      yield { type: "session.start" };
      yield { type: "turn.start" };
      yield { type: "message.end", message: assistantMsg };
      yield { type: "turn.complete", message: assistantMsg, toolResults: [] };
      // This event should never be consumed — the bottom-of-loop abort check
      // fires after the flush above and breaks out before reaching here.
      yield {
        type: "session.end",
        messages: [assistantMsg],
        usage: ZERO_USAGE,
      };
    }

    const agentStream: AgentStream = {
      [Symbol.asyncIterator]: () => streamWithSessionEnd(),
      result: () =>
        Promise.resolve({ text: "done", messages: [], usage: ZERO_USAGE, stopReason: "stop" } as any),
    };

    const route = createStreamRoute({
      defaultAgentId: AGENT_ID,
      sessionStore,
      summarize: async () => "",
      compaction: { triggerTokens: 999_999, minMessages: 9999 },
      resolveProfile: vi.fn().mockResolvedValue(makeProfile(agentStream)),
      onTurnPersisted,
    });

    const res = await route.fetch(makeReqWithSignal(reqAbortCtrl.signal));
    await drainResponse(res);

    // The flush ran exactly once for the one turn.complete
    expect(sessionStore.appendMessages).toHaveBeenCalledOnce();
    // session.end was never seen → capturedUsage null → recordTurn not called
    expect(sessionStore.recordTurn).not.toHaveBeenCalled();
    // onTurnPersisted must not fire — session never completed
    expect(onTurnPersisted).not.toHaveBeenCalled();
  });

  it("Case B: abort fires before turn.complete — no flush, no recordTurn", async () => {
    const reqAbortCtrl = new AbortController();
    const sessionStore = makeSessionStore();

    const assistantMsg = makeAssistantMsg(false);

    // The abort is called synchronously inside the generator before yielding
    // turn.start.  When the consumer receives turn.start and the bottom-of-loop
    // check runs, signal.aborted is already true — so the loop breaks before
    // ever requesting turn.complete from the generator.
    async function* streamWithEarlyAbort(): AsyncGenerator<RuntimeEvent> {
      yield { type: "session.start" };
      reqAbortCtrl.abort(); // fires before the next yield is consumed
      yield { type: "turn.start" };
      yield { type: "message.end", message: assistantMsg };
      yield { type: "turn.complete", message: assistantMsg, toolResults: [] };
      yield {
        type: "session.end",
        messages: [assistantMsg],
        usage: ZERO_USAGE,
      };
    }

    const agentStream: AgentStream = {
      [Symbol.asyncIterator]: () => streamWithEarlyAbort(),
      result: () =>
        Promise.resolve({ text: "", messages: [], usage: ZERO_USAGE, stopReason: "stop" } as any),
    };

    const route = createStreamRoute({
      defaultAgentId: AGENT_ID,
      sessionStore,
      summarize: async () => "",
      compaction: { triggerTokens: 999_999, minMessages: 9999 },
      resolveProfile: vi.fn().mockResolvedValue(makeProfile(agentStream)),
    });

    const res = await route.fetch(makeReqWithSignal(reqAbortCtrl.signal));
    await drainResponse(res);

    // turn.complete was never reached → no flush
    expect(sessionStore.appendMessages).not.toHaveBeenCalled();
    expect(sessionStore.recordTurn).not.toHaveBeenCalled();
  });
});
