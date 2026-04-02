/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  OrchestrationManager,
  type ManagedAgentInstance,
  type OrchestrationAgentFactory,
} from "../src/orchestration-manager.js";
import { OrchestrationStore } from "../src/orchestration-store.js";
import { createCloseAgentTool } from "../src/tools/close-agent.js";
import { createSendInputTool } from "../src/tools/send-input.js";
import { createSpawnAgentTool } from "../src/tools/spawn-agent.js";
import { createWaitAgentTool } from "../src/tools/wait-agent.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createSessionDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "wait-agent-manager-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createClock(...timestamps: string[]): () => string {
  let index = 0;
  const fallback = timestamps[timestamps.length - 1] ?? "2026-03-23T00:00:00.000Z";

  return () => {
    const timestamp = timestamps[index] ?? fallback;
    index += 1;
    return timestamp;
  };
}

class FakeManagedAgent implements ManagedAgentInstance {
  async deliverInput(): Promise<void> {}

  async close(): Promise<void> {}
}

function createRuntimeHarness(): {
  runtime: OrchestrationAgentFactory;
  createCalls: Array<{
    agentId: string;
    runId: string;
    role: string;
    taskId: string;
  }>;
} {
  const createCalls: Array<{
    agentId: string;
    runId: string;
    role: string;
    taskId: string;
  }> = [];

  return {
    runtime: {
      async createAgent(input) {
        createCalls.push(input);
        return new FakeManagedAgent();
      },
    },
    createCalls,
  };
}

describe("wait_agent orchestration", () => {
  it("serializes stable results for the native orchestration tools", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();
    const manager = await OrchestrationManager.create({
      sessionDir,
      runtime: runtimeHarness.runtime,
      now: createClock(
        "2026-03-23T09:59:00.000Z",
        "2026-03-23T09:59:01.000Z",
        "2026-03-23T09:59:02.000Z",
        "2026-03-23T09:59:03.000Z",
        "2026-03-23T09:59:04.000Z",
        "2026-03-23T09:59:05.000Z",
        "2026-03-23T09:59:06.000Z",
        "2026-03-23T09:59:07.000Z",
      ),
    });

    await manager.startRun({
      runId: "run-tools",
      initialTask: {
        id: "task-tools",
        kind: "tool-contract",
        input: {
          prompt: "Exercise orchestration tool builders",
        },
      },
    });

    const spawnTool = createSpawnAgentTool(manager, "run-tools");
    const sendInputTool = createSendInputTool(manager);
    const waitAgentTool = createWaitAgentTool(manager);
    const closeAgentTool = createCloseAgentTool(manager);

    const spawnResult = await spawnTool.execute("call-spawn", {
      id: "agent-tools",
      taskId: "task-tools",
      role: "researcher",
    });
    expect(spawnResult.content[0]?.type).toBe("text");
    expect((spawnResult.content[0] as { text: string }).text).toContain("agentId");
    expect(spawnResult.details).toMatchObject({
      agentId: "agent-tools",
      status: "idle",
      role: "researcher",
      taskId: "task-tools",
    });

    const sendInputResult = await sendInputTool.execute("call-send-input", {
      id: "input-tools",
      agentId: "agent-tools",
      payload: {
        prompt: "Inspect the latest account notes",
      },
    });
    expect(sendInputResult.content[0]?.type).toBe("text");
    expect((sendInputResult.content[0] as { text: string }).text).toContain("agentId");
    expect(sendInputResult.details).toMatchObject({
      agentId: "agent-tools",
      inputId: "input-tools",
      queued: true,
    });

    const waitPromise = waitAgentTool.execute("call-wait-agent", {
      id: "wait-tools",
      agentId: "agent-tools",
      kind: "agent-closed",
      description: "Wait for the researcher to finish",
      match: "all",
    });

    const closeResult = await closeAgentTool.execute("call-close-agent", {
      id: "close-tools",
      agentId: "agent-tools",
      reason: "complete",
    });
    expect(closeResult.content[0]?.type).toBe("text");
    expect((closeResult.content[0] as { text: string }).text).toContain("agentId");
    expect(closeResult.details).toMatchObject({
      agentId: "agent-tools",
      status: "closing",
      reason: "complete",
    });

    const waitResult = await waitPromise;
    expect(waitResult.content[0]?.type).toBe("text");
    expect((waitResult.content[0] as { text: string }).text).toContain("agentId");
    expect(waitResult.details).toMatchObject({
      waitId: "wait-tools",
      agentId: "agent-tools",
      status: "resolved",
      kind: "agent-closed",
      match: "all",
      resolution: {
        status: "agent_closed",
        resolvedAgentIds: ["agent-tools"],
      },
    });
    await expect.poll(() => manager.getSnapshot().queuedInputs).toEqual([]);
    await expect.poll(() => manager.getSnapshot().agents["agent-tools"]?.status).toBe("closed");
  });

  it("defaults spawn_agent tool calls to the run root task when taskId is omitted", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();
    const manager = await OrchestrationManager.create({
      sessionDir,
      runtime: runtimeHarness.runtime,
      now: createClock("2026-03-23T10:02:00.000Z", "2026-03-23T10:02:01.000Z"),
    });

    await manager.startRun({
      runId: "run-tools-root-default",
      initialTask: {
        id: "task-tools-root",
        kind: "tool-contract-root-default",
        input: {
          prompt: "Exercise root task fallback",
        },
      },
    });

    const spawnTool = createSpawnAgentTool(manager, "run-tools-root-default");
    const spawnResult = await spawnTool.execute("call-spawn-root-default", {
      id: "agent-tools-root-default",
      role: "researcher",
    });

    expect(spawnResult.details).toMatchObject({
      agentId: "agent-tools-root-default",
      status: "idle",
      role: "researcher",
      taskId: "task-tools-root",
    });
    expect(runtimeHarness.createCalls).toEqual([
      {
        agentId: "agent-tools-root-default",
        runId: "run-tools-root-default",
        role: "researcher",
        taskId: "task-tools-root",
      },
    ]);
  });

  it("resolves 'any' waits before 'all' waits", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();
    const manager = await OrchestrationManager.create({
      sessionDir,
      runtime: runtimeHarness.runtime,
      now: createClock(
        "2026-03-23T10:00:00.000Z",
        "2026-03-23T10:00:01.000Z",
        "2026-03-23T10:00:02.000Z",
        "2026-03-23T10:00:03.000Z",
        "2026-03-23T10:00:04.000Z",
        "2026-03-23T10:00:05.000Z",
        "2026-03-23T10:00:06.000Z",
      ),
    });

    await manager.startRun({
      runId: "run-4",
      initialTask: {
        id: "task-4",
        kind: "wait-any-all",
        input: {
          prompt: "Wait for agent completions",
        },
      },
    });
    await manager.spawnAgent({
      id: "agent-4a",
      runId: "run-4",
      taskId: "task-4",
      role: "reviewer",
    });
    await manager.spawnAgent({
      id: "agent-4b",
      runId: "run-4",
      taskId: "task-4",
      role: "reviewer",
    });

    const waitAny = manager.waitForAgents({
      id: "wait-any",
      agentId: "agent-4a",
      agentIds: ["agent-4a", "agent-4b"],
      kind: "agent-closed",
      description: "Wait for any reviewer",
      match: "any",
    });
    const waitAll = manager.waitForAgents({
      id: "wait-all",
      agentId: "agent-4a",
      agentIds: ["agent-4a", "agent-4b"],
      kind: "agent-closed",
      description: "Wait for both reviewers",
      match: "all",
    });

    await manager.closeAgent({
      id: "close-4a",
      agentId: "agent-4a",
      reason: "first-review-complete",
    });

    await expect(waitAny).resolves.toMatchObject({
      id: "wait-any",
      status: "resolved",
      resolution: {
        status: "agent_closed",
        match: "any",
        resolvedAgentIds: ["agent-4a"],
        pendingAgentIds: ["agent-4b"],
      },
    });
    expect(manager.getSnapshot().waits["wait-all"]?.status).toBe("pending");

    await manager.closeAgent({
      id: "close-4b",
      agentId: "agent-4b",
      reason: "second-review-complete",
    });

    await expect(waitAll).resolves.toMatchObject({
      id: "wait-all",
      status: "resolved",
      resolution: {
        status: "agent_closed",
        match: "all",
        resolvedAgentIds: ["agent-4a", "agent-4b"],
        pendingAgentIds: [],
      },
    });
  });

  it("resolves expired waits during recovery with timeout metadata", async () => {
    const sessionDir = await createSessionDir();
    const firstRuntimeHarness = createRuntimeHarness();
    const manager = await OrchestrationManager.create({
      sessionDir,
      runtime: firstRuntimeHarness.runtime,
      now: createClock(
        "2026-03-23T11:00:00.000Z",
        "2026-03-23T11:00:01.000Z",
        "2026-03-23T11:00:02.000Z",
      ),
    });

    await manager.startRun({
      runId: "run-5",
      initialTask: {
        id: "task-5",
        kind: "timeout-recovery",
        input: {
          prompt: "Persist a wait that should time out after restart",
        },
      },
    });
    await manager.spawnAgent({
      id: "agent-5",
      runId: "run-5",
      taskId: "task-5",
      role: "worker",
    });

    void manager.waitForAgents({
      id: "wait-timeout",
      agentId: "agent-5",
      kind: "agent-closed",
      description: "Wait for a worker that never closes",
      match: "all",
      timeoutAt: "2026-03-23T11:00:05.000Z",
    });
    await expect.poll(() => manager.getSnapshot().waits["wait-timeout"]?.status).toBe("pending");

    const secondRuntimeHarness = createRuntimeHarness();
    const recoveredManager = await OrchestrationManager.create({
      sessionDir,
      runtime: secondRuntimeHarness.runtime,
      now: createClock("2026-03-23T11:00:10.000Z", "2026-03-23T11:00:11.000Z"),
    });

    expect(secondRuntimeHarness.createCalls).toEqual([
      {
        agentId: "agent-5",
        runId: "run-5",
        role: "worker",
        taskId: "task-5",
      },
    ]);
    expect(recoveredManager.getSnapshot().waits["wait-timeout"]).toMatchObject({
      status: "resolved",
      timeoutAt: "2026-03-23T11:00:05.000Z",
      resolution: {
        status: "timed_out",
        match: "all",
        pendingAgentIds: ["agent-5"],
        timeoutAt: "2026-03-23T11:00:05.000Z",
      },
    });

    const events = await OrchestrationStore.loadEvents(sessionDir);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "wait_resolved",
          waitId: "wait-timeout",
          resolution: expect.objectContaining({
            status: "timed_out",
            timeoutAt: "2026-03-23T11:00:05.000Z",
          }),
        }),
      ]),
    );
  });
});
