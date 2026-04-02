/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it, vi } from "vitest";
import { createChatRoute } from "../src/chat-route.js";
import type { Agent, Message, Usage } from "@agentrail/runtime-core";

function makeUsage(): Usage {
  return {
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 15,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function makeAgent(): Agent {
  return {
    id: "agent-1",
    name: "Test Agent",
    invoke: async () => ({
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          provider: "mock",
          modelId: "mock-model",
          usage: makeUsage(),
          stopReason: "stop",
          timestamp: 2,
        },
      ],
      lastMessage: {
        role: "assistant",
        content: [{ type: "text", text: "done" }],
        provider: "mock",
        modelId: "mock-model",
        usage: makeUsage(),
        stopReason: "stop",
        timestamp: 2,
      },
      usage: makeUsage(),
      stopReason: "stop",
      text: "done",
      toolCalls: [],
    }),
    batch: async () => [],
    stream: () => {
      throw new Error("not used");
    },
  };
}

describe("createChatRoute", () => {
  it("handles plugin-intercepted chat requests before session creation", async () => {
    const sessionManager = {
      getOrCreate: vi.fn(),
    };

    const route = createChatRoute({
      defaultAgentId: "agent-1",
      sessionStore: sessionManager as never,
      resolveProfile: async () => null,
      plugins: [
        {
          name: "slash-command",
          interceptChatRequest: async () => ({
            body: {
              sessionId: null,
              text: "command ok",
              usage: { inputTokens: 0, outputTokens: 0 },
              stopReason: "stop",
            },
          }),
        },
      ],
    });

    const response = await route.request("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "/compact",
        tenantId: "tenant-1",
        userId: "user-1",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      text: "command ok",
    });
    expect(sessionManager.getOrCreate).not.toHaveBeenCalled();
  });

  it("invokes the default profile, applies plugin context, and persists the turn", async () => {
    const sessionManager = {
      getOrCreate: vi.fn(async () => ({ sessionId: "session-1" })),
      getSessionDir: vi.fn(() => "/tmp/session-1"),
      loadMessages: vi.fn(async () => []),
      loadMessagesWithBudget: vi.fn(async () => []),
      loadAllMessages: vi.fn(async () => []),
      appendMessages: vi.fn(async () => {}),
      recordTurn: vi.fn(async () => {}),
      compactIfNeeded: vi.fn(async () => false),
    };
    const invokeSpy = vi.fn();
    const contextProvider = vi.fn(async () => [
      {
        role: "user" as const,
        content: "plugin-context",
        timestamp: 1,
      },
    ]);
    const onTurnPersisted = vi.fn(async () => {});

    const route = createChatRoute({
      defaultAgentId: "agent-1",
      sessionStore: sessionManager as never,
      summarize: async () => "summary",
      compaction: { triggerTokens: 10_000, minMessages: 10 },
      resolveProfile: async () => ({
        id: "agent-1",
        name: "Test Agent",
        createAgent: async () => ({
          ...makeAgent(),
          invoke: async (message, options) => {
            invokeSpy(message, options);
            return makeAgent().invoke(message, options);
          },
        }),
      }),
      plugins: [
        {
          name: "context-plugin",
          contextProviders: [contextProvider],
          onTurnPersisted,
        },
      ],
    });

    const response = await route.request("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "hello",
        tenantId: "tenant-1",
        userId: "user-1",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sessionId: "session-1",
      text: "done",
      stopReason: "stop",
    });
    expect(invokeSpy).toHaveBeenCalledOnce();

    const [, invokeOptions] = invokeSpy.mock.calls[0] as [
      string,
      { transformContext: (messages: Message[]) => Promise<Message[]> },
    ];
    await expect(
      invokeOptions.transformContext([
        { role: "user", content: "original", timestamp: 2 },
      ]),
    ).resolves.toEqual([
      { role: "user", content: "plugin-context", timestamp: 1 },
      { role: "user", content: "original", timestamp: 2 },
    ]);
    expect(contextProvider).toHaveBeenCalledOnce();
    expect(sessionManager.appendMessages).toHaveBeenCalledOnce();
    expect(sessionManager.recordTurn).toHaveBeenCalledOnce();
    expect(onTurnPersisted).toHaveBeenCalledWith({
      kind: "chat",
      tenantId: "tenant-1",
      userId: "user-1",
      sessionId: "session-1",
      agentId: "agent-1",
    });
  });

  it("allows a resolved request handler to short-circuit normal agent invocation", async () => {
    const sessionManager = {
      getOrCreate: vi.fn(async () => ({ sessionId: "session-1" })),
      getSessionDir: vi.fn(() => "/tmp/session-1"),
    };
    const handleResolvedRequest = vi.fn(async () => ({
      body: {
        sessionId: "session-1",
        text: "deep research result",
        usage: { inputTokens: 0, outputTokens: 0 },
        stopReason: "stop",
      },
    }));

    const route = createChatRoute({
      defaultAgentId: "agent-1",
      sessionStore: sessionManager as never,
      resolveProfile: async () => {
        throw new Error("should not resolve profile");
      },
      handleResolvedRequest,
    });

    const response = await route.request("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "research this",
        mode: "deep_research",
        tenantId: "tenant-1",
        userId: "user-1",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      text: "deep research result",
    });
    expect(handleResolvedRequest).toHaveBeenCalledOnce();
  });
});
