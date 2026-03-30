/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it, vi } from "vitest";
import { createStreamRoute } from "../src/stream-route.js";
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

function makeAgent(messages: Message[]): Agent {
  return {
    id: "agent-1",
    name: "Test Agent",
    invoke: async () => {
      throw new Error("not used");
    },
    batch: async () => [],
    stream: () => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: "agent_start" as const,
        };
        yield {
          type: "agent_end" as const,
          messages,
          usage: makeUsage(),
        };
      },
      result: async () => ({
        messages,
        lastMessage: messages[messages.length - 1] as never,
        usage: makeUsage(),
        stopReason: "stop" as const,
        text: "done",
        toolCalls: [],
      }),
    }),
  };
}

describe("createStreamRoute", () => {
  it("streams agent events, compaction markers, and usage events", async () => {
    const appended: Message[][] = [];
    const sessionManager = {
      getOrCreate: vi.fn(async () => ({ sessionId: "session-1" })),
      getSessionDir: vi.fn(() => "/tmp/session-1"),
      loadAllMessages: vi.fn(async () => [
        { role: "user" as const, content: "hello world", timestamp: 1 },
      ]),
      compactIfNeeded: vi.fn(async () => {}),
      loadMessagesWithBudget: vi.fn(async () => []),
      appendMessages: vi.fn(async (_tenantId: string, _sid: string, messages: Message[]) => {
        appended.push(messages);
      }),
      recordTurn: vi.fn(async () => {}),
    };

    const sandboxManager = {
      ensureSandbox: vi.fn(async () => {}),
      listWorkspace: vi.fn(async () => []),
    };

    const route = createStreamRoute({
      dataDir: "/tmp/agentrail",
      defaultAgentId: "agent-1",
      sessionStore: sessionManager as never,
      sandboxManager: sandboxManager as never,
      summarize: async () => "summary",
      compaction: {
        triggerTokens: 1,
        minMessages: 1,
      },
      resolveProfile: async () => ({
        id: "agent-1",
        name: "Test Agent",
        createAgent: async () =>
          makeAgent([
            {
              role: "user",
              content: "hello",
              timestamp: 1,
            },
            {
              role: "assistant",
              content: [{ type: "text", text: "done" }],
              provider: "mock",
              modelId: "mock-model",
              usage: makeUsage(),
              stopReason: "stop",
              timestamp: 2,
            },
          ]),
      }),
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

    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("\"type\":\"context_compaction_start\"");
    expect(body).toContain("\"type\":\"context_compaction_end\"");
    expect(body).toContain("\"type\":\"agent_start\"");
    expect(body).toContain("\"type\":\"agent_end\"");
    expect(body).toContain("\"type\":\"context_usage\"");
    expect(sessionManager.compactIfNeeded).toHaveBeenCalledOnce();
    expect(sessionManager.appendMessages).toHaveBeenCalledOnce();
    expect(appended[0]).toHaveLength(2);
  });

  it("runs plugin attachment, context, and activity hooks", async () => {
    const sessionManager = {
      getOrCreate: vi.fn(async () => ({ sessionId: "session-1" })),
      getSessionDir: vi.fn(() => "/tmp/session-1"),
      loadAllMessages: vi.fn(async () => []),
      compactIfNeeded: vi.fn(async () => {}),
      loadMessagesWithBudget: vi.fn(async () => []),
      appendMessages: vi.fn(async () => {}),
      recordTurn: vi.fn(async () => {}),
    };

    const sandboxManager = {
      ensureSandbox: vi.fn(async () => {}),
      listWorkspace: vi.fn(async () => []),
    };

    const onRequestStart = vi.fn();
    const onRequestEnd = vi.fn();
    const onTurnPersisted = vi.fn(async () => {});
    const attachmentHandler = vi.fn(async () => ({
      contextText: "[Plugin Attachment]",
    }));
    const contextProvider = vi.fn(async () => [
      {
        role: "user" as const,
        content: "plugin-context",
        timestamp: 1,
      },
    ]);
    const streamSpy = vi.fn();

    const route = createStreamRoute({
      dataDir: "/tmp/agentrail",
      defaultAgentId: "agent-1",
      sessionStore: sessionManager as never,
      sandboxManager: sandboxManager as never,
      summarize: async () => "summary",
      compaction: {
        triggerTokens: 100,
        minMessages: 100,
      },
      plugins: [
        {
          name: "test-plugin",
          attachmentHandler,
          contextProviders: [contextProvider],
          onRequestStart,
          onRequestEnd,
          onTurnPersisted,
        },
      ],
      resolveProfile: async () => ({
        id: "agent-1",
        name: "Test Agent",
        createAgent: async () => ({
          ...makeAgent([
            {
              role: "assistant",
              content: [{ type: "text", text: "done" }],
              provider: "mock",
              modelId: "mock-model",
              usage: makeUsage(),
              stopReason: "stop",
              timestamp: 2,
            },
          ]),
          stream: (message, options) => {
            streamSpy(message, options);
            return makeAgent([
              {
                role: "assistant",
                content: [{ type: "text", text: "done" }],
                provider: "mock",
                modelId: "mock-model",
                usage: makeUsage(),
                stopReason: "stop",
                timestamp: 2,
              },
            ]).stream(message, options);
          },
        }),
      }),
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
        attachments: [
          {
            name: "notes.txt",
            base64: Buffer.from("hello", "utf8").toString("base64"),
            mimeType: "text/plain",
          },
        ],
      }),
    });
    await response.text();

    expect(response.status).toBe(200);
    expect(attachmentHandler).toHaveBeenCalledOnce();
    expect(onRequestStart).toHaveBeenCalledWith({
      kind: "stream",
      tenantId: "tenant-1",
      userId: "user-1",
      sessionId: "session-1",
      agentId: "agent-1",
    });
    expect(onRequestEnd).toHaveBeenCalledWith({
      kind: "stream",
      tenantId: "tenant-1",
      userId: "user-1",
      sessionId: "session-1",
      agentId: "agent-1",
    });
    expect(onTurnPersisted).toHaveBeenCalledWith({
      kind: "stream",
      tenantId: "tenant-1",
      userId: "user-1",
      sessionId: "session-1",
      agentId: "agent-1",
    });
    expect(streamSpy).toHaveBeenCalledOnce();

    const [message, streamOptions] = streamSpy.mock.calls[0] as [
      string,
      { transformContext: (messages: Message[]) => Promise<Message[]> },
    ];
    expect(message).toContain("[Plugin Attachment]");
    await expect(
      streamOptions.transformContext([
        { role: "user", content: "original", timestamp: 2 },
      ]),
    ).resolves.toEqual([
      { role: "user", content: "plugin-context", timestamp: 1 },
      { role: "user", content: "original", timestamp: 2 },
    ]);
    expect(contextProvider).toHaveBeenCalledOnce();
  });
});
