/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { AssistantMessage, Message, Usage } from "@agentrail/core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SessionManager } from "../src/session/session-manager.js";

const TENANT_ID = "tenant-1";
const USER_ID = "user-1";
const AGENT_ID = "agent-1";
const SESSION_ID = "session-1";

function makeAssistantMessage(
  text: string,
  usage?: Partial<Usage>,
  timestamp = Date.now(),
): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    provider: "mock",
    modelId: "mock-model",
    stopReason: "stop",
    usage: usage
      ? {
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          cacheReadTokens: usage.cacheReadTokens ?? 0,
          cacheWriteTokens: usage.cacheWriteTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
          cost: usage.cost ?? {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0,
          },
        }
      : undefined,
    timestamp,
  } as AssistantMessage;
}

describe("SessionManager.getLastContextUsage", () => {
  it("prefers the last assistant message usage over the aggregated turn usage", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "agentrail-session-manager-"));
    try {
      const sessionManager = new SessionManager(dataDir);
      await sessionManager.getOrCreate(TENANT_ID, USER_ID, AGENT_ID, SESSION_ID);

      const messages: Message[] = [
        { role: "user", content: "hello", timestamp: 1 } as Message,
        makeAssistantMessage(
          "first internal turn",
          { inputTokens: 100, outputTokens: 20, cacheReadTokens: 2000, cacheWriteTokens: 500 },
          2,
        ) as Message,
        makeAssistantMessage(
          "final answer",
          { inputTokens: 58, outputTokens: 191, cacheReadTokens: 12449, cacheWriteTokens: 155 },
          3,
        ) as Message,
      ];
      await sessionManager.appendMessages(TENANT_ID, SESSION_ID, messages);

      await sessionManager.recordTurn(TENANT_ID, SESSION_ID, {
        inputTokens: 58,
        outputTokens: 378,
        cacheReadTokens: 19693,
        cacheWriteTokens: 5338,
        totalTokens: 25467,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      });

      await expect(sessionManager.getLastContextUsage(TENANT_ID, SESSION_ID)).resolves.toEqual({
        inputTokens: 12662,
        outputTokens: 191,
        budgetUsedPct: 6,
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("falls back to the last turn event when assistant messages do not carry usage", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "agentrail-session-manager-"));
    try {
      const sessionManager = new SessionManager(dataDir);
      await sessionManager.getOrCreate(TENANT_ID, USER_ID, AGENT_ID, SESSION_ID);

      await sessionManager.appendMessages(TENANT_ID, SESSION_ID, [
        { role: "user", content: "hello", timestamp: 1 } as Message,
        makeAssistantMessage("final answer", undefined, 2) as Message,
      ]);

      await sessionManager.recordTurn(TENANT_ID, SESSION_ID, {
        inputTokens: 58,
        outputTokens: 378,
        cacheReadTokens: 19693,
        cacheWriteTokens: 5338,
        totalTokens: 25467,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      });

      await expect(sessionManager.getLastContextUsage(TENANT_ID, SESSION_ID)).resolves.toEqual({
        inputTokens: 25089,
        outputTokens: 378,
        budgetUsedPct: 13,
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
