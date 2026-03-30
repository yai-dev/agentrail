/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type {
  AgentInputEnvelope,
  CreateManagedAgentInput,
  ManagedAgentDeliveryResult,
} from "@agentrail/orchestration";
import { OrchestrationStore } from "@agentrail/orchestration";
import {
  createSubAgentProcess,
  createManagedSubAgentInstance,
  resolveWorkerCwd,
  resolveWorkerExecArgv,
} from "@agentrail/orchestration/worker";

function getWorkerPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const extension = currentFile.endsWith(".ts") ? ".ts" : ".js";
  return join(
    dirname(currentFile),
    "../src/agents/default-subagent-worker-entry" + extension,
  );
}

class FakeChildProcess extends EventEmitter {
  readonly sent: unknown[] = [];
  readonly killSignals: Array<NodeJS.Signals | number | undefined> = [];

  send(message: unknown): void {
    this.sent.push(message);
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killSignals.push(signal);
    return true;
  }
}

function createInput(): CreateManagedAgentInput {
  return {
    agentId: "agent-process-test",
    runId: "run-process-test",
    taskId: "task-process-test",
    role: "worker",
  };
}

function createEnvelope(): AgentInputEnvelope {
  return {
    id: "input-process-test",
    agentId: "agent-process-test",
    queuedAt: "2026-03-23T12:00:00.000Z",
    payload: {
      prompt: "Summarize account notes",
    },
  };
}

test("close waits for the worker exit before resolving", async () => {
  const child = new FakeChildProcess();
  const instancePromise = createManagedSubAgentInstance(child as never, {
    tenantId: "tenant-test",
    userId: "user-test",
    sessionId: "session-test",
    sessionDir: "/tmp/session-test",
    input: createInput(),
    workerPath: getWorkerPath(),
    runtimeConfig: {},
  });

  child.emit("message", { type: "ready" });
  const instance = await instancePromise;

  let closed = false;
  const closePromise = instance.close("complete").then(() => {
    closed = true;
  });

  await Promise.resolve();
  assert.equal(closed, false);

  child.emit("exit", 0, null);
  await closePromise;
  assert.equal(closed, true);
});

test("deliverInput resolves the worker run_turn result", async () => {
  const child = new FakeChildProcess();
  const instancePromise = createManagedSubAgentInstance(child as never, {
    tenantId: "tenant-test",
    userId: "user-test",
    sessionId: "session-test",
    sessionDir: "/tmp/session-test",
    input: createInput(),
    workerPath: getWorkerPath(),
    runtimeConfig: {},
  });

  child.emit("message", { type: "ready" });
  const instance = await instancePromise;

  const deliveryPromise = instance.deliverInput(createEnvelope());
  const runTurn = child.sent.find(
    (message): message is { type: "run_turn"; requestId: string } =>
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      (message as { type?: string }).type === "run_turn",
  );

  assert.ok(runTurn);

  const result: ManagedAgentDeliveryResult = {
    jobId: "job:input-process-test",
    consumedInputIds: ["input-process-test"],
    outcome: "completed",
    outputText: "done",
  };
  child.emit("message", {
    type: "run_turn_result",
    requestId: runTurn.requestId,
    result,
  });

  await assert.doesNotReject(deliveryPromise);
  await assert.doesNotReject(async () => {
    const resolved = await deliveryPromise;
    assert.deepEqual(resolved, result);
  });
});

test("subscribes to autonomous worker lifecycle events", async () => {
  const child = new FakeChildProcess();
  const instancePromise = createManagedSubAgentInstance(child as never, {
    tenantId: "tenant-test",
    userId: "user-test",
    sessionId: "session-test",
    sessionDir: "/tmp/session-test",
    input: createInput(),
    workerPath: getWorkerPath(),
    runtimeConfig: {},
  });

  child.emit("message", { type: "ready" });
  const instance = await instancePromise;

  const seen: string[] = [];
  instance.subscribe?.({
    onJobStarted: async (job) => {
      seen.push(`started:${job.jobId}:${job.inputIds.join(",")}`);
    },
    onJobCompleted: async (result) => {
      seen.push(`completed:${result.jobId}:${result.outcome}`);
    },
    onIdle: async () => {
      seen.push("idle");
    },
  });

  const deliveryPromise = instance.deliverInput(createEnvelope());
  child.emit("message", {
    type: "job_started",
    jobId: "job:input-process-test",
    inputIds: ["input-process-test"],
  });
  child.emit("message", {
    type: "run_turn_result",
    requestId: (child.sent.find(
      (message): message is { type: "run_turn"; requestId: string } =>
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        (message as { type?: string }).type === "run_turn",
    ) as { requestId: string }).requestId,
    result: {
      jobId: "job:input-process-test",
      consumedInputIds: ["input-process-test"],
      outcome: "completed",
      outputText: "done",
    },
  });
  child.emit("message", {
    type: "job_completed",
    result: {
      jobId: "job:input-process-test",
      consumedInputIds: ["input-process-test"],
      outcome: "completed",
      outputText: "done",
    },
  });
  child.emit("message", { type: "idle" });

  await deliveryPromise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, [
    "started:job:input-process-test:input-process-test",
    "completed:job:input-process-test:completed",
    "idle",
  ]);
});

test("fails fast when the worker never reports ready", async () => {
  const child = new FakeChildProcess();

  const instancePromise = createManagedSubAgentInstance(child as never, {
    tenantId: "tenant-test",
    userId: "user-test",
    sessionId: "session-test",
    sessionDir: "/tmp/session-test",
    input: createInput(),
    workerPath: getWorkerPath(),
    runtimeConfig: {},
    readyTimeoutMs: 20,
  });

  await assert.rejects(
    instancePromise,
    /did not become ready within 20ms/,
  );
  assert.equal(child.sent[0] && typeof child.sent[0] === "object", true);
  assert.deepEqual(child.killSignals, ["SIGTERM"]);
});

test("real default sub-agent worker completes a wake-driven turn", async () => {
  const sessionDir = await mkdtemp(join(tmpdir(), "default-subagent-process-real-"));

  try {
    await OrchestrationStore.appendMailboxEvent(sessionDir, "agent-process-test", {
      eventId: "mailbox-process-1",
      type: "input_enqueued",
      agentId: "agent-process-test",
      occurredAt: "2026-03-23T22:00:00.000Z",
      inputId: "input-process-test",
      payload: {
        prompt: "process me",
      },
    });

    const instance = await createSubAgentProcess({
      tenantId: "tenant-test",
      userId: "user-test",
      sessionId: "session-test",
      sessionDir,
      input: createInput(),
      workerPath: getWorkerPath(),
      runtimeConfig: {},
      workerConfig: {
        fakeExecution: "echo",
        pollIntervalMs: 25,
      },
    });

    const seen: string[] = [];
    instance.subscribe?.({
      onJobStarted: async (job) => {
        seen.push(`started:${job.inputIds.join(",")}`);
      },
      onJobCompleted: async (result) => {
        seen.push(`completed:${result.outputText ?? ""}`);
      },
      onIdle: async () => {
        seen.push("idle");
      },
    });

    const result = await instance.deliverInput(createEnvelope());
    assert.equal(result.outputText, "process me");
    await waitFor(() => seen.includes("idle"));
    assert.deepEqual(seen, [
      "started:input-process-test",
      "completed:process me",
      "idle",
    ]);

    await instance.close("done");
  } finally {
    await rm(sessionDir, { recursive: true, force: true });
  }
});

test("filters parent execArgv down to runtime-safe loader flags", () => {
  assert.deepEqual(
    resolveWorkerExecArgv([
      "--import=tsx/esm",
      "--enable-source-maps",
      "--watch",
      "--watch-preserve-output",
      "--inspect=127.0.0.1:9229",
      "--test",
      "--conditions=development",
      "--loader",
      "some-loader.mjs",
      "-r",
      "./register.js",
    ]),
    [
      "--import=tsx/esm",
      "--enable-source-maps",
      "--conditions=development",
      "--loader",
      "some-loader.mjs",
      "-r",
      "./register.js",
    ],
  );
});

test("uses the parent working directory for worker process resolution", () => {
  assert.equal(
    resolveWorkerCwd("/tmp/worker-entry.ts", "/tmp/example-app"),
    "/tmp/example-app",
  );
  assert.equal(
    resolveWorkerCwd("/tmp/worker-entry.js", "/tmp/example-app"),
    "/tmp/example-app",
  );
});

test("real default sub-agent worker reports malformed mailbox data as a failed turn", async () => {
  const sessionDir = await mkdtemp(join(tmpdir(), "default-subagent-process-bad-mailbox-"));

  try {
    const agentDirectory = join(
      sessionDir,
      "orchestration",
      "subagents",
      "agent-process-test",
    );
    await mkdir(agentDirectory, { recursive: true });
    await writeFile(
      join(agentDirectory, "mailbox.jsonl"),
      "{this-is-not-json}\n",
      "utf8",
    );

    const instance = await createSubAgentProcess({
      tenantId: "tenant-test",
      userId: "user-test",
      sessionId: "session-test",
      sessionDir,
      input: createInput(),
      workerPath: getWorkerPath(),
      runtimeConfig: {},
      workerConfig: {
        fakeExecution: "echo",
        pollIntervalMs: 25,
      },
    });

    const result = await instance.deliverInput(createEnvelope());
    assert.equal(result.outcome, "failed");
    assert.match(result.error ?? "", /JSON|Unexpected token|Expected property name/i);

    await instance.close("done");
  } finally {
    await rm(sessionDir, { recursive: true, force: true });
  }
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error("Timed out waiting for condition");
}
