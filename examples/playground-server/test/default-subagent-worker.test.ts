/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createSessionRef } from "@agentrail/core";
import { createFilesystemOrchestrationPersistence } from "@agentrail/capabilities";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

interface WorkerMessage {
  type: string;
  [key: string]: unknown;
}

function resolveWorkerPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const extension = currentFile.endsWith(".ts") ? ".ts" : ".js";
  return join(dirname(currentFile), "../src/agents/default-subagent-worker-entry" + extension);
}

test("worker polls mailbox and drains pending work without an explicit wake", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "default-subagent-worker-"));
  const agentId = "agent-worker-poll";
  const tenantId = "tenant-test";
  const sessionId = "session-test";
  const sessionRef = createSessionRef(tenantId, sessionId);
  const sessionDir = join(dataDir, "tenants", tenantId, "sessions", sessionId);
  const persistence = createFilesystemOrchestrationPersistence(dataDir, sessionRef);
  const worker = fork(resolveWorkerPath(), [], {
    cwd: dirname(resolveWorkerPath()),
    execArgv: process.execArgv,
    env: process.env,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });

  const messages: WorkerMessage[] = [];
  worker.on("message", (message: WorkerMessage) => {
    messages.push(message);
  });

  try {
    worker.send({
      type: "init",
      tenantId,
      userId: "user-test",
      sessionId,
      sessionRef,
      dataDir,
      runtimeConfig: {
        input: {
          agentId,
          runId: "run-test",
          taskId: "task-test",
          role: "worker",
        },
      },
      workerConfig: {
        fakeExecution: "echo",
        pollIntervalMs: 25,
      },
    });

    await waitForMessage(messages, (message) => message.type === "ready");

    await persistence.appendMailboxEvent(agentId, {
      eventId: "mailbox-worker-1",
      type: "input_enqueued",
      agentId,
      occurredAt: "2026-03-23T20:00:00.000Z",
      inputId: "input-worker-1",
      payload: {
        prompt: "poll me",
      },
    });

    await waitForMessage(
      messages,
      (message) =>
        message.type === "job_started" && String(message.jobId).startsWith("job:input-worker-1"),
    );
    await waitForMessage(
      messages,
      (message) =>
        message.type === "job_completed" &&
        typeof message.result === "object" &&
        message.result !== null &&
        (message.result as { outputText?: string }).outputText === "poll me",
    );
    await waitForMessage(messages, (message) => message.type === "idle");

    const mailboxState = await persistence.loadMailboxState(agentId);
    assert.equal(mailboxState.processedEventCount, 1);
  } finally {
    worker.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
});

async function waitForMessage(
  messages: WorkerMessage[],
  predicate: (message: WorkerMessage) => boolean,
): Promise<WorkerMessage> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const match = messages.find(predicate);
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error("Timed out waiting for worker message");
}
