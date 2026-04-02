/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Message } from "@agentrail/runtime-core";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { SessionManager } from "../src/session-manager.js";

const dataDir = await mkdtemp(join(tmpdir(), "agentrail-memo-test-"));
const sessionManager = new SessionManager(dataDir);

after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

function makeMessages(prefix: string, start = 0): Message[] {
  return [
    { role: "user", content: `${prefix} user ${start}`, timestamp: Date.now() + start },
    {
      role: "assistant",
      content: [{ type: "text", text: `${prefix} assistant ${start}` }],
      timestamp: Date.now() + start + 1,
    } as Message,
    { role: "user", content: `${prefix} user ${start + 1}`, timestamp: Date.now() + start + 2 },
    {
      role: "assistant",
      content: [{ type: "text", text: `${prefix} assistant ${start + 1}` }],
      timestamp: Date.now() + start + 3,
    } as Message,
  ];
}

test("session manager archives multiple compactions and restores full history", async () => {
  const tenantId = "tenant-1";
  const userId = "user-1";
  const sessionId = "session-1";

  await sessionManager.getOrCreate(tenantId, userId, "agent-1", sessionId);
  await sessionManager.appendMessages(tenantId, sessionId, [
    ...makeMessages("phase-a", 0),
    ...makeMessages("phase-b", 2),
  ]);

  const firstResult = await sessionManager.compactSession(
    tenantId,
    sessionId,
    async () => "summary-one",
    { force: true },
  );
  assert.ok(firstResult);
  assert.equal(firstResult.archiveId, "0001");

  await sessionManager.appendMessages(tenantId, sessionId, [
    ...makeMessages("phase-c", 4),
    ...makeMessages("phase-d", 6),
  ]);

  const secondResult = await sessionManager.compactSession(
    tenantId,
    sessionId,
    async () => "summary-two",
    { force: true },
  );
  assert.ok(secondResult);
  assert.equal(secondResult.archiveId, "0002");

  const compactionFiles = await readdir(sessionManager.getCompactionsDir(tenantId, sessionId));
  assert.deepEqual(compactionFiles.sort(), ["0001.jsonl", "0002.jsonl"]);

  const fullHistory = await sessionManager.loadFullSessionMessages(tenantId, sessionId);
  const userMessages = fullHistory.filter((message) => message.role === "user");
  assert.equal(userMessages.length, 8);
  assert.match(String(userMessages[0]?.content), /phase-a user 0/);
  assert.match(String(userMessages[userMessages.length - 1]?.content), /phase-d user 7/);
});
