/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { OrchestrationStore } from "../src/orchestration-store.js";
import type {
  AgentInputEnvelope,
  OrchestrationEvent,
  OrchestrationSnapshot,
} from "../src/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function createSessionDir(): Promise<string> {
  const directory = await mkdtemp(
    join(tmpdir(), "agent-orchestration-session-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function createEvents(): OrchestrationEvent[] {
  return [
    {
      eventId: "evt-1",
      type: "run_started",
      occurredAt: "2026-03-23T09:00:00.000Z",
      runId: "run-1",
      initialTask: {
        id: "task-1",
        kind: "deliver-user-request",
        input: {
          prompt: "Investigate the orchestration replay model",
        },
      },
    },
    {
      eventId: "evt-2",
      type: "agent_spawned",
      occurredAt: "2026-03-23T09:00:01.000Z",
      runId: "run-1",
      agent: {
        id: "agent-1",
        displayName: "Nova",
        taskId: "task-1",
        role: "worker",
      },
    },
    {
      eventId: "evt-3",
      type: "agent_input_queued",
      occurredAt: "2026-03-23T09:00:02.000Z",
      runId: "run-1",
      input: {
        id: "input-1",
        agentId: "agent-1",
        payload: {
          prompt: "First follow-up",
        },
      },
    },
    {
      eventId: "evt-4",
      type: "agent_input_queued",
      occurredAt: "2026-03-23T09:00:03.000Z",
      runId: "run-1",
      input: {
        id: "input-2",
        agentId: "agent-1",
        payload: {
          prompt: "Second follow-up",
        },
      },
    },
    {
      eventId: "evt-5",
      type: "agent_status_changed",
      occurredAt: "2026-03-23T09:00:04.000Z",
      runId: "run-1",
      agentId: "agent-1",
      status: "waiting",
    },
    {
      eventId: "evt-6",
      type: "wait_registered",
      occurredAt: "2026-03-23T09:00:05.000Z",
      runId: "run-1",
      wait: {
        id: "wait-1",
        agentId: "agent-1",
        kind: "agent-response",
        description: "Waiting for the worker agent to respond",
      },
    },
  ];
}

function createCheckpointSnapshot(): OrchestrationSnapshot {
  return {
    run: {
      id: "run-1",
      status: "running",
      initialTaskId: "task-1",
      createdAt: "2026-03-23T09:00:00.000Z",
      updatedAt: "2026-03-23T09:00:01.000Z",
    },
    tasks: {
      "task-1": {
        id: "task-1",
        runId: "run-1",
        kind: "deliver-user-request",
        input: {
          prompt: "Investigate the orchestration replay model",
        },
        createdAt: "2026-03-23T09:00:00.000Z",
      },
    },
    agents: {
      "agent-1": {
        id: "agent-1",
        runId: "run-1",
        taskId: "task-1",
        displayName: "Nova",
        role: "worker",
        status: "idle",
        createdAt: "2026-03-23T09:00:01.000Z",
        updatedAt: "2026-03-23T09:00:01.000Z",
      },
    },
    waits: {},
    queuedInputs: [],
    lastEventId: "evt-2",
  };
}

function createRestartSnapshot(
  queuedInput?: AgentInputEnvelope,
): OrchestrationSnapshot {
  return {
    run: {
      id: "run-2",
      status: "running",
      initialTaskId: "task-2",
      createdAt: "2026-03-23T10:00:00.000Z",
      updatedAt: "2026-03-23T10:00:03.000Z",
    },
    tasks: {
      "task-2": {
        id: "task-2",
        runId: "run-2",
        kind: "collect-artifacts",
        input: {
          scope: "recent-errors",
        },
        createdAt: "2026-03-23T10:00:00.000Z",
      },
    },
    agents: {
      "agent-2": {
        id: "agent-2",
        runId: "run-2",
        taskId: "task-2",
        displayName: "Atlas",
        role: "worker",
        status: "waiting",
        createdAt: "2026-03-23T10:00:01.000Z",
        updatedAt: "2026-03-23T10:00:03.000Z",
      },
    },
    waits: {
      "wait-2": {
        id: "wait-2",
        runId: "run-2",
        agentId: "agent-2",
        kind: "agent-response",
        description: "Waiting for the restarted worker",
        status: "pending",
        registeredAt: "2026-03-23T10:00:03.000Z",
      },
    },
    queuedInputs: queuedInput ? [queuedInput] : [],
    lastEventId: "evt-10",
  };
}

function createIncompatibleCheckpointSnapshot(): OrchestrationSnapshot {
  return {
    run: {
      id: "stale-run",
      status: "running",
      initialTaskId: "stale-task",
      createdAt: "2026-03-22T23:59:00.000Z",
      updatedAt: "2026-03-22T23:59:03.000Z",
    },
    tasks: {
      "stale-task": {
        id: "stale-task",
        runId: "stale-run",
        kind: "stale-task-kind",
        input: {
          prompt: "stale checkpoint",
        },
        createdAt: "2026-03-22T23:59:00.000Z",
      },
    },
    agents: {
      "stale-agent": {
        id: "stale-agent",
        runId: "stale-run",
        taskId: "stale-task",
        role: "worker",
        status: "waiting",
        createdAt: "2026-03-22T23:59:01.000Z",
        updatedAt: "2026-03-22T23:59:03.000Z",
      },
    },
    waits: {
      "stale-wait": {
        id: "stale-wait",
        runId: "stale-run",
        agentId: "stale-agent",
        kind: "agent-response",
        description: "stale wait",
        status: "pending",
        registeredAt: "2026-03-22T23:59:03.000Z",
      },
    },
    queuedInputs: [
      {
        id: "input-1",
        agentId: "agent-1",
        payload: {
          prompt: "First follow-up",
        },
        queuedAt: "2026-03-23T09:00:02.000Z",
      },
    ],
    lastEventId: "missing-anchor",
  };
}

function createTerminalRunEvents(): OrchestrationEvent[] {
  return [
    {
      eventId: "evt-20",
      type: "run_started",
      occurredAt: "2026-03-23T11:00:00.000Z",
      runId: "run-3",
      initialTask: {
        id: "task-3",
        kind: "summarize-results",
        input: {
          scope: "terminal-run",
        },
      },
    },
    {
      eventId: "evt-21",
      type: "agent_spawned",
      occurredAt: "2026-03-23T11:00:01.000Z",
      runId: "run-3",
      agent: {
        id: "agent-3",
        displayName: "Echo",
        taskId: "task-3",
        role: "worker",
      },
    },
    {
      eventId: "evt-22",
      type: "agent_status_changed",
      occurredAt: "2026-03-23T11:00:02.000Z",
      runId: "run-3",
      agentId: "agent-3",
      status: "waiting",
    },
    {
      eventId: "evt-23",
      type: "wait_registered",
      occurredAt: "2026-03-23T11:00:03.000Z",
      runId: "run-3",
      wait: {
        id: "wait-3",
        agentId: "agent-3",
        kind: "agent-response",
        description: "Waiting for output before terminal completion",
      },
    },
    {
      eventId: "evt-24",
      type: "run_completed",
      occurredAt: "2026-03-23T11:00:04.000Z",
      runId: "run-3",
      status: "completed",
    },
  ];
}

describe("OrchestrationStore", () => {
  it("writes orchestration events to the session-scoped jsonl log", async () => {
    const sessionDir = await createSessionDir();
    const [eventOne, eventTwo] = createEvents();

    expect(OrchestrationStore).toBeDefined();

    await OrchestrationStore.appendEvent(sessionDir, eventOne!);
    await OrchestrationStore.appendEvent(sessionDir, eventTwo!);

    const eventLogPath = join(sessionDir, "orchestration", "events.jsonl");
    const logContents = await readFile(eventLogPath, "utf8");

    expect(logContents).toBe(
      `${JSON.stringify(eventOne)}\n${JSON.stringify(eventTwo)}\n`,
    );
    await expect(OrchestrationStore.loadEvents(sessionDir)).resolves.toEqual([
      eventOne,
      eventTwo,
    ]);
  });

  it("writes orchestration checkpoint snapshots to disk", async () => {
    const sessionDir = await createSessionDir();
    const snapshot = createCheckpointSnapshot();

    await OrchestrationStore.writeCheckpoint(sessionDir, snapshot);

    const checkpointPath = join(
      sessionDir,
      "orchestration",
      "checkpoint.json",
    );
    const checkpointContents = await readFile(checkpointPath, "utf8");

    expect(JSON.parse(checkpointContents)).toEqual(snapshot);
    await expect(OrchestrationStore.loadSnapshot(sessionDir)).resolves.toEqual(
      snapshot,
    );
  });

  it("replays checkpoint state plus tail events during recovery", async () => {
    const sessionDir = await createSessionDir();
    const events = createEvents();

    for (const event of events) {
      await OrchestrationStore.appendEvent(sessionDir, event);
    }

    await OrchestrationStore.writeCheckpoint(
      sessionDir,
      createCheckpointSnapshot(),
    );

    const recovered = await OrchestrationStore.recoverState(sessionDir);

    expect(recovered.snapshot.run?.id).toBe("run-1");
    expect(recovered.snapshot.agents["agent-1"]?.status).toBe("waiting");
    expect(recovered.snapshot.agents["agent-1"]?.displayName).toBe("Nova");
    expect(recovered.snapshot.waits["wait-1"]?.status).toBe("pending");
    expect(recovered.snapshot.lastEventId).toBe("evt-6");
    expect(recovered.snapshot.queuedInputs.map((input) => input.id)).toEqual([
      "input-1",
      "input-2",
    ]);
    expect(recovered.pendingWaits.map((wait) => wait.id)).toEqual(["wait-1"]);
    expect(recovered.activeAgents.map((agent) => agent.id)).toEqual([
      "agent-1",
    ]);
  });

  it("recovers pending waits after restart from the persisted checkpoint", async () => {
    const sessionDir = await createSessionDir();
    const restartSnapshot = createRestartSnapshot();

    await OrchestrationStore.writeCheckpoint(sessionDir, restartSnapshot);

    const recovered = await OrchestrationStore.recoverState(sessionDir);

    expect(recovered.snapshot).toEqual(restartSnapshot);
    expect(recovered.pendingWaits.map((wait) => wait.id)).toEqual(["wait-2"]);
    expect(recovered.activeAgents.map((agent) => agent.id)).toEqual([
      "agent-2",
    ]);
  });

  it("does not surface resumable waits or agents for terminal runs", async () => {
    const sessionDir = await createSessionDir();

    for (const event of createTerminalRunEvents()) {
      await OrchestrationStore.appendEvent(sessionDir, event);
    }

    const recovered = await OrchestrationStore.recoverState(sessionDir);

    expect(recovered.snapshot.run?.status).toBe("completed");
    expect(recovered.snapshot.waits["wait-3"]?.status).toBe("pending");
    expect(recovered.snapshot.agents["agent-3"]?.status).toBe("waiting");
    expect(recovered.pendingWaits).toEqual([]);
    expect(recovered.activeAgents).toEqual([]);
  });

  it("discards an incompatible checkpoint when its anchor is missing from the event log", async () => {
    const sessionDir = await createSessionDir();

    for (const event of createEvents()) {
      await OrchestrationStore.appendEvent(sessionDir, event);
    }

    await OrchestrationStore.writeCheckpoint(
      sessionDir,
      createIncompatibleCheckpointSnapshot(),
    );

    const recovered = await OrchestrationStore.recoverState(sessionDir);

    expect(recovered.snapshot.run?.id).toBe("run-1");
    expect(recovered.snapshot.tasks["stale-task"]).toBeUndefined();
    expect(recovered.snapshot.agents["stale-agent"]).toBeUndefined();
    expect(recovered.snapshot.waits["stale-wait"]).toBeUndefined();
    expect(recovered.snapshot.queuedInputs.map((input) => input.id)).toEqual([
      "input-1",
      "input-2",
    ]);
  });

  it("falls back to event replay when checkpoint json is invalid", async () => {
    const sessionDir = await createSessionDir();

    for (const event of createEvents()) {
      await OrchestrationStore.appendEvent(sessionDir, event);
    }

    await writeFile(
      join(sessionDir, "orchestration", "checkpoint.json"),
      '{"run":{"id":"run-1"',
      "utf8",
    );

    const recovered = await OrchestrationStore.recoverState(sessionDir);

    expect(recovered.snapshot.run?.id).toBe("run-1");
    expect(recovered.snapshot.lastEventId).toBe("evt-6");
    expect(recovered.snapshot.agents["agent-1"]?.status).toBe("waiting");
    expect(recovered.snapshot.waits["wait-1"]?.status).toBe("pending");
    expect(recovered.snapshot.queuedInputs.map((input) => input.id)).toEqual([
      "input-1",
      "input-2",
    ]);
  });
});
