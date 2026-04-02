/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createSessionRef } from "@agentrail/memo";
import type { Message, Usage } from "@agentrail/runtime-core";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDir = await mkdtemp(join(tmpdir(), "agentrail-deep-research-stream-handler-"));
const configPath = join(dataDir, "agentrail.yaml");
await writeFile(configPath, `version: 1\npaths:\n  dataDir: ${JSON.stringify(dataDir)}\n`, "utf8");
process.env.AGENTRAIL_CONFIG_PATH = configPath;

const { createPlaygroundDeepResearchModeStreamHandler } =
  await import("../src/chat/deep-research.js");
const sessionRef = createSessionRef("tenant-1", "session-1");

after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.AGENTRAIL_CONFIG_PATH;
});

function makeUsage(): Usage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

test("deep research stream handler delegates matching requests to the streaming runner", async () => {
  const events: object[] = [];
  const persisted: { messages: Message[]; usage: Usage }[] = [];
  let capturedQuery = "";

  const handler = createPlaygroundDeepResearchModeStreamHandler(async (input) => {
    capturedQuery = input.query;
    await input.onEvent?.({ type: "subagent_spawned", agentId: "researcher-1" });
    await input.persistTurn?.(
      [
        {
          role: "assistant",
          content: [{ type: "text", text: "deep research report" }],
          provider: "mock",
          modelId: "mock-model",
          usage: makeUsage(),
          stopReason: "stop",
          timestamp: Date.now(),
        },
      ],
      makeUsage(),
    );
    return {
      sessionId: input.sessionId ?? "session-1",
      state: {
        run: {
          id: "run-1",
          sessionId: input.sessionId ?? "session-1",
          tenantId: input.tenantId,
          userId: input.userId,
          query: input.query,
          title: input.query,
          status: "completed",
          createdAt: "2026-03-30T00:00:00.000Z",
          updatedAt: "2026-03-30T00:00:00.000Z",
        },
        plan: null,
        steps: [],
        sources: [],
        artifacts: [],
        reportMarkdown: "deep research report",
        entityProfile: null,
      },
    };
  });

  const handled = await handler({
    request: {
      message: "Investigate the issue",
      mode: "deep_research",
      tenantId: "tenant-1",
      userId: "user-1",
      sessionId: "session-1",
    },
    agentId: "agent-1",
    tenantId: "tenant-1",
    userId: "user-1",
    sessionId: "session-1",
    sessionRef,
    signal: new AbortController().signal,
    sessionStore: {} as never,
    uploadedFiles: [],
    writeEvent: async (event) => {
      events.push(event);
    },
    persistTurn: async (messages, usage) => {
      persisted.push({ messages, usage });
    },
  });

  assert.equal(handled, true);
  assert.equal(capturedQuery, "Investigate the issue");
  assert.deepEqual(events, [{ type: "subagent_spawned", agentId: "researcher-1" }]);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]?.messages[0]?.role, "assistant");
});

test("deep research stream handler emits an error event on failure", async () => {
  const events: object[] = [];
  const persisted: { messages: Message[]; usage: Usage }[] = [];

  const handler = createPlaygroundDeepResearchModeStreamHandler(async () => {
    throw new Error("Sub-agent worker did not become ready within 5000ms");
  });

  const handled = await handler({
    request: {
      message: "Investigate the issue",
      mode: "deep_research",
      tenantId: "tenant-1",
      userId: "user-1",
      sessionId: "session-1",
    },
    agentId: "agent-1",
    tenantId: "tenant-1",
    userId: "user-1",
    sessionId: "session-1",
    sessionRef,
    signal: new AbortController().signal,
    sessionStore: {} as never,
    uploadedFiles: [],
    writeEvent: async (event) => {
      events.push(event);
    },
    persistTurn: async (messages, usage) => {
      persisted.push({ messages, usage });
    },
  });

  assert.equal(handled, true);
  assert.deepEqual(events, [
    {
      type: "error",
      error: {
        message: "Sub-agent worker did not become ready within 5000ms",
      },
    },
  ]);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]?.messages[1]?.role, "assistant");
  assert.match(
    String((persisted[0]?.messages[1]?.content as Array<{ type: string; text?: string }>)[0]?.text),
    /Deep Research failed: Sub-agent worker did not become ready within 5000ms/,
  );
});

test("deep research stream handler ignores normal chat mode", async () => {
  const handler = createPlaygroundDeepResearchModeStreamHandler(async () => {
    throw new Error("should not run");
  });

  const handled = await handler({
    request: {
      message: "hello",
      mode: "chat",
      tenantId: "tenant-1",
      userId: "user-1",
      sessionId: "session-1",
    },
    agentId: "agent-1",
    tenantId: "tenant-1",
    userId: "user-1",
    sessionId: "session-1",
    sessionRef,
    signal: new AbortController().signal,
    sessionStore: {} as never,
    uploadedFiles: [],
    writeEvent: async () => {},
    persistTurn: async () => {},
  });

  assert.equal(handled, false);
});
