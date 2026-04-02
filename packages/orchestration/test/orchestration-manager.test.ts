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
  type ManagedAgentEventHandlers,
  type ManagedAgentInstance,
  type OrchestrationAgentFactory,
  type OrchestrationManagerEvent,
} from "../src/orchestration-manager.js";
import { createFilesystemOrchestrationStore } from "../src/orchestration-store.js";
import type { AgentInputEnvelope, ManagedAgentDeliveryResult } from "../src/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createSessionDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "agent-orchestration-manager-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createPersistence(sessionDir: string) {
  const store = createFilesystemOrchestrationStore(sessionDir);
  return {
    appendEvent: (event: Parameters<typeof store.appendEvent>[0]) => store.appendEvent(event),
    loadEvents: () => store.loadEvents(),
    loadSnapshot: () => store.loadSnapshot(),
    writeCheckpoint: (snapshot: Parameters<typeof store.writeCheckpoint>[0]) =>
      store.writeCheckpoint(snapshot),
    recoverState: () => store.recoverState(),
    appendMailboxEvent: (agentId: string, event: Parameters<typeof store.appendMailboxEvent>[1]) =>
      store.appendMailboxEvent(agentId, event),
    loadMailboxEvents: (agentId: string) => store.loadMailboxEvents(agentId),
    loadMailboxState: (agentId: string) => store.loadMailboxState(agentId),
    writeMailboxState: (agentId: string, state: Parameters<typeof store.writeMailboxState>[1]) =>
      store.writeMailboxState(agentId, state),
  };
}

const OrchestrationStore = {
  appendEvent: (
    sessionDir: string,
    event: Parameters<ReturnType<typeof createFilesystemOrchestrationStore>["appendEvent"]>[0],
  ) => createFilesystemOrchestrationStore(sessionDir).appendEvent(event),
  appendMailboxEvent: (
    sessionDir: string,
    agentId: string,
    event: Parameters<
      ReturnType<typeof createFilesystemOrchestrationStore>["appendMailboxEvent"]
    >[1],
  ) => createFilesystemOrchestrationStore(sessionDir).appendMailboxEvent(agentId, event),
  loadEvents: (sessionDir: string) => createFilesystemOrchestrationStore(sessionDir).loadEvents(),
  loadMailboxState: (sessionDir: string, agentId: string) =>
    createFilesystemOrchestrationStore(sessionDir).loadMailboxState(agentId),
  writeMailboxState: (
    sessionDir: string,
    agentId: string,
    state: Parameters<
      ReturnType<typeof createFilesystemOrchestrationStore>["writeMailboxState"]
    >[1],
  ) => createFilesystemOrchestrationStore(sessionDir).writeMailboxState(agentId, state),
  writeCheckpoint: (
    sessionDir: string,
    snapshot: Parameters<
      ReturnType<typeof createFilesystemOrchestrationStore>["writeCheckpoint"]
    >[0],
  ) => createFilesystemOrchestrationStore(sessionDir).writeCheckpoint(snapshot),
};

function createManager(sessionDir: string, runtime: OrchestrationAgentFactory, now?: () => string) {
  return OrchestrationManager.create({
    persistence: createPersistence(sessionDir),
    runtime,
    now,
  });
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

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

class FakeManagedAgent implements ManagedAgentInstance {
  deliveries: AgentInputEnvelope[] = [];
  closeReasons: Array<string | undefined> = [];
  onDeliver?:
    | ((input: AgentInputEnvelope) => Promise<ManagedAgentDeliveryResult | void>)
    | ((input: AgentInputEnvelope) => ManagedAgentDeliveryResult | void);

  async deliverInput(input: AgentInputEnvelope): Promise<ManagedAgentDeliveryResult | void> {
    this.deliveries.push(input);
    return this.onDeliver?.(input);
  }

  async close(reason?: string): Promise<void> {
    this.closeReasons.push(reason);
  }
}

class FakeAutonomousManagedAgent extends FakeManagedAgent {
  autonomousDelivery = true as const;
  handlers?: ManagedAgentEventHandlers;

  subscribe(handlers: ManagedAgentEventHandlers): void {
    this.handlers = handlers;
  }

  override async deliverInput(
    input: AgentInputEnvelope,
  ): Promise<ManagedAgentDeliveryResult | void> {
    this.deliveries.push(input);
    queueMicrotask(() => {
      void this.handlers?.onJobStarted?.({
        jobId: `job:${input.id}`,
        inputIds: [input.id],
      });
      void this.handlers?.onJobCompleted?.({
        jobId: `job:${input.id}`,
        consumedInputIds: [input.id],
        outcome: "completed",
        outputText: `completed ${input.id}`,
      });
      void this.handlers?.onIdle?.();
    });
    return undefined;
  }
}

function createRuntimeHarness(): {
  runtime: OrchestrationAgentFactory;
  createCalls: Array<{
    agentId: string;
    runId: string;
    role: string;
    taskId: string;
  }>;
  instances: Map<string, FakeManagedAgent>;
} {
  const createCalls: Array<{
    agentId: string;
    runId: string;
    role: string;
    taskId: string;
  }> = [];
  const instances = new Map<string, FakeManagedAgent>();

  return {
    runtime: {
      async createAgent(input) {
        createCalls.push(input);
        const instance = new FakeManagedAgent();
        instances.set(input.agentId, instance);
        return instance;
      },
    },
    createCalls,
    instances,
  };
}

function createAutonomousRuntimeHarness(): {
  runtime: OrchestrationAgentFactory;
  instances: Map<string, FakeAutonomousManagedAgent>;
} {
  const instances = new Map<string, FakeAutonomousManagedAgent>();

  return {
    runtime: {
      async createAgent(input) {
        const instance = new FakeAutonomousManagedAgent();
        instances.set(input.agentId, instance);
        return instance;
      },
    },
    instances,
  };
}

function createFlakyRuntimeHarness(): {
  runtime: OrchestrationAgentFactory;
  createCalls: string[];
  instances: Map<string, FakeManagedAgent>;
} {
  const createCalls: string[] = [];
  const instances = new Map<string, FakeManagedAgent>();
  let shouldFail = true;

  return {
    runtime: {
      async createAgent(input) {
        createCalls.push(input.agentId);

        if (shouldFail) {
          shouldFail = false;
          throw new Error(`failed to attach ${input.agentId}`);
        }

        const instance = new FakeManagedAgent();
        instances.set(input.agentId, instance);
        return instance;
      },
    },
    createCalls,
    instances,
  };
}

describe("OrchestrationManager", () => {
  it("spawns an agent instance and emits orchestration events", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();
    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock("2026-03-23T09:00:00.000Z", "2026-03-23T09:00:01.000Z"),
    );

    await manager.startRun({
      runId: "run-1",
      initialTask: {
        id: "task-1",
        kind: "deliver-user-request",
        input: {
          prompt: "Prepare a lifecycle test",
        },
      },
    });

    const events: OrchestrationManagerEvent[] = [];
    manager.subscribe((event) => {
      events.push(event);
    });

    await manager.spawnAgent({
      id: "agent-1",
      runId: "run-1",
      taskId: "task-1",
      role: "researcher",
    });

    expect(runtimeHarness.createCalls).toEqual([
      {
        agentId: "agent-1",
        runId: "run-1",
        role: "researcher",
        taskId: "task-1",
      },
    ]);
    expect(manager.getSnapshot().agents["agent-1"]).toMatchObject({
      id: "agent-1",
      runId: "run-1",
      taskId: "task-1",
      role: "researcher",
      displayName: expect.any(String),
      status: "idle",
    });
    expect(manager.getSnapshot().agents["agent-1"]?.displayName).toBeTruthy();
    expect(events[0]?.event).toMatchObject({
      type: "agent_spawned",
      agent: {
        id: "agent-1",
        displayName: expect.any(String),
      },
    });
    expect(events.map((entry) => entry.event.type)).toEqual(["agent_spawned"]);
    await expect(OrchestrationStore.loadEvents(sessionDir)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "agent_spawned",
          runId: "run-1",
        }),
      ]),
    );
  });

  it("defaults a spawned agent to the run root task and rejects conflicting respawns", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();
    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock("2026-03-23T09:01:00.000Z", "2026-03-23T09:01:01.000Z"),
    );

    await manager.startRun({
      runId: "run-root-default",
      initialTask: {
        id: "task-root",
        kind: "root-task",
        input: {
          prompt: "Use the root task by default",
        },
      },
    });

    await expect(
      manager.spawnAgent({
        id: "agent-root-default",
        runId: "run-root-default",
        role: "researcher",
      }),
    ).resolves.toMatchObject({
      id: "agent-root-default",
      taskId: "task-root",
      role: "researcher",
    });

    await expect(
      manager.spawnAgent({
        id: "agent-root-default",
        runId: "run-root-default",
        taskId: "task-root",
        role: "reviewer",
      }),
    ).rejects.toThrow("already exists with taskId task-root, role researcher, and displayName");
  });

  it("preserves an explicit display name and keeps auto-generated names unique within a run", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();
    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock(
        "2026-03-23T09:01:10.000Z",
        "2026-03-23T09:01:11.000Z",
        "2026-03-23T09:01:12.000Z",
      ),
    );

    await manager.startRun({
      runId: "run-display-name",
      initialTask: {
        id: "task-display-name",
        kind: "display-name",
        input: {
          prompt: "Assign codenames",
        },
      },
    });

    const explicit = await manager.spawnAgent({
      id: "agent-explicit-name",
      runId: "run-display-name",
      taskId: "task-display-name",
      role: "researcher",
      displayName: "Nova",
    });
    const generated = await manager.spawnAgent({
      id: "agent-generated-name",
      runId: "run-display-name",
      taskId: "task-display-name",
      role: "analyst",
    });

    expect(explicit.displayName).toBe("Nova");
    expect(generated.displayName).toBeTruthy();
    expect(generated.displayName).not.toBe("Nova");
  });

  it("rejects spawning an agent against an unknown task", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();
    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock("2026-03-23T09:01:30.000Z"),
    );

    await manager.startRun({
      runId: "run-invalid-task",
      initialTask: {
        id: "task-known",
        kind: "known-task",
        input: {
          prompt: "Reject unknown tasks",
        },
      },
    });

    await expect(
      manager.spawnAgent({
        id: "agent-invalid-task",
        runId: "run-invalid-task",
        taskId: "task-missing",
        role: "researcher",
      }),
    ).rejects.toThrow("Unknown orchestration task task-missing. Known task IDs: task-known.");
  });

  it("marks the orchestration run as failed when completed with an error", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();
    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock("2026-03-23T09:04:00.000Z", "2026-03-23T09:04:01.000Z"),
    );

    await manager.startRun({
      runId: "run-failed",
      initialTask: {
        id: "task-failed",
        kind: "deep-research",
        input: {
          prompt: "Fail fast on startup timeout",
        },
      },
    });

    await manager.completeRun({
      runId: "run-failed",
      status: "failed",
      error: "Sub-agent worker did not become ready within 5000ms",
    });

    expect(manager.getSnapshot().runs["run-failed"]).toMatchObject({
      id: "run-failed",
      status: "failed",
      completedAt: "2026-03-23T09:04:01.000Z",
    });
    await expect(OrchestrationStore.loadEvents(sessionDir)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "run_completed",
          runId: "run-failed",
          status: "failed",
          error: "Sub-agent worker did not become ready within 5000ms",
        }),
      ]),
    );
  });

  it("retries attaching a spawned agent after an initial runtime creation failure", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createFlakyRuntimeHarness();
    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock(
        "2026-03-23T09:05:00.000Z",
        "2026-03-23T09:05:01.000Z",
        "2026-03-23T09:05:02.000Z",
        "2026-03-23T09:05:03.000Z",
        "2026-03-23T09:05:04.000Z",
      ),
    );

    await manager.startRun({
      runId: "run-1b",
      initialTask: {
        id: "task-1b",
        kind: "retry-spawn",
        input: {
          prompt: "Attach a retried worker",
        },
      },
    });

    await expect(
      manager.spawnAgent({
        id: "agent-1b",
        runId: "run-1b",
        taskId: "task-1b",
        role: "worker",
      }),
    ).rejects.toThrow("failed to attach agent-1b");

    await expect(
      manager.spawnAgent({
        id: "agent-1b",
        runId: "run-1b",
        taskId: "task-1b",
        role: "worker",
      }),
    ).resolves.toMatchObject({
      id: "agent-1b",
      status: "idle",
    });

    await expect(
      manager.sendInput({
        id: "input-1b",
        agentId: "agent-1b",
        payload: {
          prompt: "deliver after retry",
        },
      }),
    ).resolves.toBeUndefined();

    expect(runtimeHarness.createCalls).toEqual(["agent-1b", "agent-1b"]);
    await expect
      .poll(() => runtimeHarness.instances.get("agent-1b")?.deliveries.map((input) => input.id))
      .toEqual(["input-1b"]);
  });

  it("accepts autonomous runtime callbacks for job lifecycle updates", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createAutonomousRuntimeHarness();
    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock(
        "2026-03-23T09:06:00.000Z",
        "2026-03-23T09:06:01.000Z",
        "2026-03-23T09:06:02.000Z",
        "2026-03-23T09:06:03.000Z",
      ),
    );

    await manager.startRun({
      runId: "run-autonomous",
      initialTask: {
        id: "task-autonomous",
        kind: "autonomous-runtime",
        input: {
          prompt: "Handle lifecycle via callbacks",
        },
      },
    });
    await manager.spawnAgent({
      id: "agent-autonomous",
      runId: "run-autonomous",
      taskId: "task-autonomous",
      role: "worker",
    });

    await manager.sendInput({
      id: "input-autonomous",
      agentId: "agent-autonomous",
      payload: {
        prompt: "autonomous delivery",
      },
    });

    await expect
      .poll(() => manager.getSnapshot().agents["agent-autonomous"]?.lastJob)
      .toMatchObject({
        jobId: "job:input-autonomous",
        inputIds: ["input-autonomous"],
        outcome: "completed",
        outputText: "completed input-autonomous",
      });
    await expect.poll(() => manager.getSnapshot().agents["agent-autonomous"]?.status).toBe("idle");
    expect(runtimeHarness.instances.get("agent-autonomous")?.deliveries).toHaveLength(1);
    expect(manager.getSnapshot().queuedInputs).toEqual([]);
  });

  it("re-attaches and drains persisted queued inputs after a spawn retry without restart", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createFlakyRuntimeHarness();
    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock(
        "2026-03-23T09:07:00.000Z",
        "2026-03-23T09:07:01.000Z",
        "2026-03-23T09:07:02.000Z",
        "2026-03-23T09:07:03.000Z",
        "2026-03-23T09:07:04.000Z",
        "2026-03-23T09:07:05.000Z",
      ),
    );

    await manager.startRun({
      runId: "run-1c",
      initialTask: {
        id: "task-1c",
        kind: "retry-spawn-drain-queue",
        input: {
          prompt: "Drain queued work after attach retry",
        },
      },
    });

    await expect(
      manager.spawnAgent({
        id: "agent-1c",
        runId: "run-1c",
        taskId: "task-1c",
        role: "worker",
      }),
    ).rejects.toThrow("failed to attach agent-1c");

    await expect(
      manager.sendInput({
        id: "input-1c",
        agentId: "agent-1c",
        payload: {
          prompt: "deliver queued work after retry",
        },
      }),
    ).rejects.toThrow("does not have an active runtime");

    expect(manager.getSnapshot().queuedInputs.map((input) => input.id)).toEqual(["input-1c"]);

    await expect(
      manager.spawnAgent({
        id: "agent-1c",
        runId: "run-1c",
        taskId: "task-1c",
        role: "worker",
      }),
    ).resolves.toMatchObject({
      id: "agent-1c",
      status: "idle",
    });

    await expect
      .poll(() => runtimeHarness.instances.get("agent-1c")?.deliveries.map((input) => input.id))
      .toEqual(["input-1c"]);
    expect(manager.getSnapshot().queuedInputs).toEqual([]);
  });

  it("tolerates recovered attach failure on startup and recovers later through retry attach", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createFlakyRuntimeHarness();

    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-r1",
      type: "run_started",
      occurredAt: "2026-03-23T09:08:00.000Z",
      runId: "run-1d",
      initialTask: {
        id: "task-1d",
        kind: "recover-after-attach-failure",
        input: {
          prompt: "Boot without crashing on attach failure",
        },
      },
    });
    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-r2",
      type: "agent_spawned",
      occurredAt: "2026-03-23T09:08:01.000Z",
      runId: "run-1d",
      agent: {
        id: "agent-1d",
        taskId: "task-1d",
        role: "worker",
      },
    });
    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-r3",
      type: "agent_input_queued",
      occurredAt: "2026-03-23T09:08:02.000Z",
      runId: "run-1d",
      input: {
        id: "input-1d",
        agentId: "agent-1d",
        payload: {
          prompt: "queued before restart",
        },
      },
    });

    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock(
        "2026-03-23T09:08:03.000Z",
        "2026-03-23T09:08:04.000Z",
        "2026-03-23T09:08:05.000Z",
      ),
    );

    expect(manager.getSnapshot().agents["agent-1d"]).toMatchObject({
      id: "agent-1d",
      status: "idle",
    });
    expect(manager.getSnapshot().queuedInputs.map((input) => input.id)).toEqual(["input-1d"]);

    await expect(
      manager.spawnAgent({
        id: "agent-1d",
        runId: "run-1d",
        taskId: "task-1d",
        role: "worker",
      }),
    ).resolves.toMatchObject({
      id: "agent-1d",
      status: "idle",
    });

    await expect
      .poll(() => runtimeHarness.instances.get("agent-1d")?.deliveries.map((input) => input.id))
      .toEqual(["input-1d"]);
    expect(manager.getSnapshot().queuedInputs).toEqual([]);
  });

  it("delivers queued input to an active agent in FIFO order", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();
    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock(
        "2026-03-23T09:10:00.000Z",
        "2026-03-23T09:10:01.000Z",
        "2026-03-23T09:10:02.000Z",
        "2026-03-23T09:10:03.000Z",
        "2026-03-23T09:10:04.000Z",
        "2026-03-23T09:10:05.000Z",
        "2026-03-23T09:10:06.000Z",
        "2026-03-23T09:10:07.000Z",
        "2026-03-23T09:10:08.000Z",
        "2026-03-23T09:10:09.000Z",
      ),
    );

    await manager.startRun({
      runId: "run-2",
      initialTask: {
        id: "task-2",
        kind: "follow-up",
        input: {
          prompt: "Queue two pieces of input",
        },
      },
    });
    await manager.spawnAgent({
      id: "agent-2",
      runId: "run-2",
      taskId: "task-2",
      role: "worker",
    });

    const instance = runtimeHarness.instances.get("agent-2");
    expect(instance).toBeDefined();

    const firstStarted = createDeferred<void>();
    const releaseFirst = createDeferred<void>();
    const observedDeliveries: string[] = [];

    instance!.onDeliver = async (input) => {
      observedDeliveries.push(input.id);

      if (input.id === "input-1") {
        firstStarted.resolve(undefined);
        await releaseFirst.promise;
      }
    };

    const firstDelivery = manager.sendInput({
      id: "input-1",
      agentId: "agent-2",
      payload: {
        prompt: "first",
      },
    });
    await firstStarted.promise;

    const secondDelivery = manager.sendInput({
      id: "input-2",
      agentId: "agent-2",
      payload: {
        prompt: "second",
      },
    });

    await Promise.resolve();
    expect(observedDeliveries).toEqual(["input-1"]);

    releaseFirst.resolve(undefined);
    await Promise.all([firstDelivery, secondDelivery]);
    await expect.poll(() => observedDeliveries).toEqual(["input-1", "input-2"]);

    expect(instance!.deliveries.map((input) => input.id)).toEqual(["input-1", "input-2"]);
  });

  it("returns from sendInput once the input is queued without waiting for delivery to finish", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();
    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock(
        "2026-03-23T09:15:00.000Z",
        "2026-03-23T09:15:01.000Z",
        "2026-03-23T09:15:02.000Z",
        "2026-03-23T09:15:03.000Z",
      ),
    );

    await manager.startRun({
      runId: "run-queued-return",
      initialTask: {
        id: "task-queued-return",
        kind: "queue-without-awaiting-delivery",
        input: {
          prompt: "Return after queueing",
        },
      },
    });
    await manager.spawnAgent({
      id: "agent-queued-return",
      runId: "run-queued-return",
      taskId: "task-queued-return",
      role: "worker",
    });

    const instance = runtimeHarness.instances.get("agent-queued-return");
    expect(instance).toBeDefined();

    const deliveryStarted = createDeferred<void>();
    const releaseDelivery = createDeferred<void>();
    let sendResolved = false;

    instance!.onDeliver = async () => {
      deliveryStarted.resolve(undefined);
      await releaseDelivery.promise;
    };

    const sendPromise = manager.sendInput({
      id: "input-queued-return",
      agentId: "agent-queued-return",
      payload: {
        prompt: "do not await the worker turn",
      },
    });
    void sendPromise.then(() => {
      sendResolved = true;
    });

    await deliveryStarted.promise;
    await Promise.resolve();

    expect(sendResolved).toBe(true);
    expect(manager.getSnapshot().queuedInputs.map((input) => input.id)).toEqual([
      "input-queued-return",
    ]);

    releaseDelivery.resolve(undefined);
    await sendPromise;
    await expect.poll(() => manager.getSnapshot().queuedInputs).toEqual([]);
  });

  it("marks closed agents as terminal and resolves dependent waits", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();
    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock(
        "2026-03-23T09:20:00.000Z",
        "2026-03-23T09:20:01.000Z",
        "2026-03-23T09:20:02.000Z",
        "2026-03-23T09:20:03.000Z",
        "2026-03-23T09:20:04.000Z",
      ),
    );

    await manager.startRun({
      runId: "run-3",
      initialTask: {
        id: "task-3",
        kind: "close-agent",
        input: {
          prompt: "Close the worker after it finishes",
        },
      },
    });
    await manager.spawnAgent({
      id: "agent-3",
      runId: "run-3",
      taskId: "task-3",
      role: "worker",
    });

    const wait = manager.waitForAgents({
      id: "wait-1",
      agentId: "agent-3",
      kind: "agent-closed",
      description: "Wait for the worker to finish",
      match: "all",
    });

    await manager.closeAgent({
      id: "close-1",
      agentId: "agent-3",
      reason: "work-complete",
    });

    await expect(wait).resolves.toMatchObject({
      status: "resolved",
      resolution: {
        status: "agent_closed",
        match: "all",
        resolvedAgentIds: ["agent-3"],
        pendingAgentIds: [],
      },
    });
    expect(runtimeHarness.instances.get("agent-3")?.closeReasons).toEqual(["work-complete"]);
    expect(manager.getSnapshot().agents["agent-3"]).toMatchObject({
      status: "closed",
      closedAt: "2026-03-23T09:20:04.000Z",
    });
  });

  it("returns closing immediately when closeAgent is requested during an active turn", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();
    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock(
        "2026-03-23T09:21:00.000Z",
        "2026-03-23T09:21:01.000Z",
        "2026-03-23T09:21:02.000Z",
        "2026-03-23T09:21:03.000Z",
        "2026-03-23T09:21:04.000Z",
        "2026-03-23T09:21:05.000Z",
      ),
    );

    await manager.startRun({
      runId: "run-closing",
      initialTask: {
        id: "task-closing",
        kind: "close-while-running",
        input: {
          prompt: "Close an active worker",
        },
      },
    });
    await manager.spawnAgent({
      id: "agent-closing",
      runId: "run-closing",
      taskId: "task-closing",
      role: "worker",
    });

    const instance = runtimeHarness.instances.get("agent-closing");
    expect(instance).toBeDefined();

    const deliveryStarted = createDeferred<void>();
    const releaseDelivery = createDeferred<void>();
    instance!.onDeliver = async () => {
      deliveryStarted.resolve(undefined);
      await releaseDelivery.promise;
    };

    await manager.sendInput({
      id: "input-closing",
      agentId: "agent-closing",
      payload: {
        prompt: "keep running until close is requested",
      },
    });
    await deliveryStarted.promise;

    const closeResult = await manager.closeAgent({
      id: "close-closing",
      agentId: "agent-closing",
      reason: "finish-current-turn",
    });

    expect(closeResult).toMatchObject({
      id: "agent-closing",
      status: "closing",
    });
    expect(manager.getSnapshot().agents["agent-closing"]).toMatchObject({
      status: "closing",
    });

    releaseDelivery.resolve(undefined);

    await expect.poll(() => manager.getSnapshot().agents["agent-closing"]?.status).toBe("closed");
  });

  it("persists mailbox closeRequested state as soon as close is requested", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();
    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock(
        "2026-03-23T09:21:30.000Z",
        "2026-03-23T09:21:31.000Z",
        "2026-03-23T09:21:32.000Z",
        "2026-03-23T09:21:33.000Z",
      ),
    );

    await manager.startRun({
      runId: "run-close-mailbox-state",
      initialTask: {
        id: "task-close-mailbox-state",
        kind: "close-mailbox-state",
        input: {
          prompt: "Persist closeRequested eagerly",
        },
      },
    });
    await manager.spawnAgent({
      id: "agent-close-mailbox-state",
      runId: "run-close-mailbox-state",
      taskId: "task-close-mailbox-state",
      role: "worker",
    });

    const instance = runtimeHarness.instances.get("agent-close-mailbox-state");
    expect(instance).toBeDefined();
    const releaseClose = createDeferred<void>();
    instance!.close = async (reason?: string) => {
      instance!.closeReasons.push(reason);
      await releaseClose.promise;
    };

    await expect(
      manager.closeAgent({
        id: "close-mailbox-state",
        agentId: "agent-close-mailbox-state",
        reason: "persist-before-exit",
      }),
    ).resolves.toMatchObject({
      status: "closing",
    });

    await expect(
      OrchestrationStore.loadMailboxState(sessionDir, "agent-close-mailbox-state"),
    ).resolves.toMatchObject({
      closeRequested: {
        occurredAt: "2026-03-23T09:21:32.000Z",
        reason: "persist-before-exit",
      },
    });

    releaseClose.resolve(undefined);
    await expect
      .poll(() => manager.getSnapshot().agents["agent-close-mailbox-state"]?.status)
      .toBe("closed");
  });

  it("resolves agent-idle waits with the most recent job result after queued work completes", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();
    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock(
        "2026-03-23T09:22:00.000Z",
        "2026-03-23T09:22:01.000Z",
        "2026-03-23T09:22:02.000Z",
        "2026-03-23T09:22:03.000Z",
        "2026-03-23T09:22:04.000Z",
        "2026-03-23T09:22:05.000Z",
      ),
    );

    await manager.startRun({
      runId: "run-idle-result",
      initialTask: {
        id: "task-idle-result",
        kind: "wait-for-job-result",
        input: {
          prompt: "Wait for a queued job to finish",
        },
      },
    });
    await manager.spawnAgent({
      id: "agent-idle-result",
      runId: "run-idle-result",
      taskId: "task-idle-result",
      role: "worker",
    });

    const instance = runtimeHarness.instances.get("agent-idle-result");
    expect(instance).toBeDefined();

    const releaseDelivery = createDeferred<void>();
    instance!.onDeliver = async (input) => {
      await releaseDelivery.promise;
      return {
        jobId: `job:${input.id}`,
        consumedInputIds: [input.id],
        outcome: "completed",
        outputText: "summarized account notes",
      };
    };

    await manager.sendInput({
      id: "input-idle-result",
      agentId: "agent-idle-result",
      payload: {
        prompt: "Summarize the latest notes",
      },
    });

    await expect
      .poll(() => manager.getSnapshot().agents["agent-idle-result"]?.status)
      .toBe("running");

    const wait = manager.waitForAgents({
      id: "wait-idle-result",
      agentId: "agent-idle-result",
      kind: "agent-idle",
      description: "Wait for the worker result",
      match: "all",
    });

    releaseDelivery.resolve(undefined);

    await expect(wait).resolves.toMatchObject({
      status: "resolved",
      resolution: {
        status: "agent_idle",
        match: "all",
        resolvedAgentIds: ["agent-idle-result"],
        pendingAgentIds: [],
        job: {
          jobId: "job:input-idle-result",
          outcome: "completed",
          outputText: "summarized account notes",
        },
      },
    });
  });

  it("emits job lifecycle events for started and failed deliveries", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();
    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock(
        "2026-03-23T09:23:00.000Z",
        "2026-03-23T09:23:01.000Z",
        "2026-03-23T09:23:02.000Z",
        "2026-03-23T09:23:03.000Z",
        "2026-03-23T09:23:04.000Z",
      ),
    );

    await manager.startRun({
      runId: "run-job-events",
      initialTask: {
        id: "task-job-events",
        kind: "job-events",
        input: {
          prompt: "Track started and failed jobs",
        },
      },
    });
    await manager.spawnAgent({
      id: "agent-job-events",
      runId: "run-job-events",
      taskId: "task-job-events",
      role: "worker",
    });

    const events: OrchestrationManagerEvent[] = [];
    manager.subscribe((event) => {
      events.push(event);
    });

    const instance = runtimeHarness.instances.get("agent-job-events");
    expect(instance).toBeDefined();
    instance!.onDeliver = async (input) => {
      throw new Error(`failed to process ${input.id}`);
    };

    await manager.sendInput({
      id: "input-job-events",
      agentId: "agent-job-events",
      payload: {
        prompt: "fail this job",
      },
    });

    await expect.poll(() => events.map((entry) => entry.event.type)).toContain("agent_job_failed");
    expect(events.map((entry) => entry.event.type)).toContain("agent_job_started");
    expect(manager.getSnapshot().agents["agent-job-events"]?.lastJob).toMatchObject({
      outcome: "failed",
      error: "failed to process input-job-events",
    });
  });

  it("records the full drained mailbox batch in agent_job_started", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();

    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-batch-r1",
      type: "run_started",
      occurredAt: "2026-03-23T09:24:00.000Z",
      runId: "run-batch-started",
      initialTask: {
        id: "task-batch-started",
        kind: "batch-started",
        input: {
          prompt: "Record the drained batch",
        },
      },
    });
    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-batch-r2",
      type: "agent_spawned",
      occurredAt: "2026-03-23T09:24:01.000Z",
      runId: "run-batch-started",
      agent: {
        id: "agent-batch-started",
        taskId: "task-batch-started",
        role: "worker",
      },
    });
    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-batch-r3",
      type: "agent_input_queued",
      occurredAt: "2026-03-23T09:24:02.000Z",
      runId: "run-batch-started",
      input: {
        id: "input-batch-1",
        agentId: "agent-batch-started",
        payload: {
          prompt: "first in batch",
        },
      },
    });
    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-batch-r4",
      type: "agent_input_queued",
      occurredAt: "2026-03-23T09:24:03.000Z",
      runId: "run-batch-started",
      input: {
        id: "input-batch-2",
        agentId: "agent-batch-started",
        payload: {
          prompt: "second in batch",
        },
      },
    });
    await OrchestrationStore.appendMailboxEvent(sessionDir, "agent-batch-started", {
      eventId: "mailbox-batch-1",
      type: "input_enqueued",
      agentId: "agent-batch-started",
      occurredAt: "2026-03-23T09:24:02.000Z",
      inputId: "input-batch-1",
      payload: {
        prompt: "first in batch",
      },
    });
    await OrchestrationStore.appendMailboxEvent(sessionDir, "agent-batch-started", {
      eventId: "mailbox-batch-2",
      type: "input_enqueued",
      agentId: "agent-batch-started",
      occurredAt: "2026-03-23T09:24:03.000Z",
      inputId: "input-batch-2",
      payload: {
        prompt: "second in batch",
      },
    });

    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock(
        "2026-03-23T09:24:04.000Z",
        "2026-03-23T09:24:05.000Z",
        "2026-03-23T09:24:06.000Z",
        "2026-03-23T09:24:07.000Z",
      ),
    );

    const instance = runtimeHarness.instances.get("agent-batch-started");
    expect(instance).toBeDefined();
    instance!.onDeliver = async () => ({
      jobId: "job-batch-started",
      consumedInputIds: ["input-batch-1", "input-batch-2"],
      outcome: "completed",
      outputText: "batched",
    });

    await expect
      .poll(() => manager.getSnapshot().agents["agent-batch-started"]?.lastJob)
      .toMatchObject({
        jobId: "job-batch-started",
        inputIds: ["input-batch-1", "input-batch-2"],
      });

    const events = await OrchestrationStore.loadEvents(sessionDir);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "agent_job_started",
          agentId: "agent-batch-started",
          inputIds: ["input-batch-1", "input-batch-2"],
        }),
      ]),
    );
  });

  it("drops queued inputs for a closed agent so recovery does not keep orphaned work", async () => {
    const sessionDir = await createSessionDir();
    const firstRuntimeHarness = createRuntimeHarness();
    const firstManager = await createManager(
      sessionDir,
      firstRuntimeHarness.runtime,
      createClock(
        "2026-03-23T09:25:00.000Z",
        "2026-03-23T09:25:01.000Z",
        "2026-03-23T09:25:02.000Z",
        "2026-03-23T09:25:03.000Z",
        "2026-03-23T09:25:04.000Z",
        "2026-03-23T09:25:05.000Z",
        "2026-03-23T09:25:06.000Z",
        "2026-03-23T09:25:07.000Z",
        "2026-03-23T09:25:08.000Z",
        "2026-03-23T09:25:09.000Z",
      ),
    );

    await firstManager.startRun({
      runId: "run-3b",
      initialTask: {
        id: "task-3b",
        kind: "close-with-queue",
        input: {
          prompt: "Close while one input is still queued",
        },
      },
    });
    await firstManager.spawnAgent({
      id: "agent-3b",
      runId: "run-3b",
      taskId: "task-3b",
      role: "worker",
    });

    const instance = firstRuntimeHarness.instances.get("agent-3b");
    expect(instance).toBeDefined();

    const firstStarted = createDeferred<void>();
    const releaseFirst = createDeferred<void>();

    instance!.onDeliver = async (input) => {
      if (input.id === "input-3b-1") {
        firstStarted.resolve(undefined);
        await releaseFirst.promise;
      }
    };

    void firstManager.sendInput({
      id: "input-3b-1",
      agentId: "agent-3b",
      payload: {
        prompt: "first queued item",
      },
    });
    await firstStarted.promise;

    void firstManager.sendInput({
      id: "input-3b-2",
      agentId: "agent-3b",
      payload: {
        prompt: "second queued item",
      },
    });

    await expect
      .poll(() => firstManager.getSnapshot().queuedInputs.map((input) => input.id))
      .toEqual(["input-3b-1", "input-3b-2"]);

    await firstManager.closeAgent({
      id: "close-3b",
      agentId: "agent-3b",
      reason: "cancel-queue",
    });

    await expect
      .poll(() => firstManager.getSnapshot().queuedInputs.map((input) => input.id))
      .toEqual(["input-3b-1"]);

    const secondRuntimeHarness = createRuntimeHarness();
    const recoveredManager = await createManager(
      sessionDir,
      secondRuntimeHarness.runtime,
      createClock("2026-03-23T09:26:00.000Z"),
    );

    releaseFirst.resolve(undefined);

    expect(secondRuntimeHarness.createCalls).toEqual([]);
    expect(recoveredManager.getSnapshot().queuedInputs).toEqual([]);
    await expect.poll(() => firstManager.getSnapshot().queuedInputs).toEqual([]);
    await expect.poll(() => firstManager.getSnapshot().agents["agent-3b"]?.status).toBe("closed");
    await expect(OrchestrationStore.loadEvents(sessionDir)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "agent_input_removed",
          agentId: "agent-3b",
          inputId: "input-3b-2",
          reason: "agent_closed",
        }),
      ]),
    );
  });

  it("resumes persisted queued inputs in FIFO order after restart", async () => {
    const sessionDir = await createSessionDir();
    const firstRuntimeHarness = createRuntimeHarness();
    const firstManager = await createManager(
      sessionDir,
      firstRuntimeHarness.runtime,
      createClock(
        "2026-03-23T09:30:00.000Z",
        "2026-03-23T09:30:01.000Z",
        "2026-03-23T09:30:02.000Z",
        "2026-03-23T09:30:03.000Z",
        "2026-03-23T09:30:04.000Z",
        "2026-03-23T09:30:05.000Z",
        "2026-03-23T09:30:06.000Z",
      ),
    );

    await firstManager.startRun({
      runId: "run-4",
      initialTask: {
        id: "task-4",
        kind: "resume-queued-inputs",
        input: {
          prompt: "Queue two inputs before restart",
        },
      },
    });
    await firstManager.spawnAgent({
      id: "agent-4",
      runId: "run-4",
      taskId: "task-4",
      role: "worker",
    });

    const firstInstance = firstRuntimeHarness.instances.get("agent-4");
    expect(firstInstance).toBeDefined();

    const firstDeliveryStarted = createDeferred<void>();
    const blockOriginalRuntime = createDeferred<void>();

    firstInstance!.onDeliver = async (input) => {
      if (input.id === "input-1") {
        firstDeliveryStarted.resolve(undefined);
        await blockOriginalRuntime.promise;
      }
    };

    void firstManager.sendInput({
      id: "input-1",
      agentId: "agent-4",
      payload: {
        prompt: "first before restart",
      },
    });
    await firstDeliveryStarted.promise;

    void firstManager.sendInput({
      id: "input-2",
      agentId: "agent-4",
      payload: {
        prompt: "second before restart",
      },
    });

    await expect
      .poll(() => firstManager.getSnapshot().queuedInputs.map((input) => input.id))
      .toEqual(["input-1", "input-2"]);

    const secondRuntimeHarness = createRuntimeHarness();
    await createManager(
      sessionDir,
      secondRuntimeHarness.runtime,
      createClock(
        "2026-03-23T09:31:00.000Z",
        "2026-03-23T09:31:01.000Z",
        "2026-03-23T09:31:02.000Z",
        "2026-03-23T09:31:03.000Z",
      ),
    );

    const resumedInstance = secondRuntimeHarness.instances.get("agent-4");
    expect(resumedInstance).toBeDefined();
    await expect
      .poll(() => resumedInstance?.deliveries.map((input) => input.id))
      .toEqual(["input-1", "input-2"]);
  });

  it("resolves pending waits on startup when recovered agent state already satisfies them", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();

    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-1",
      type: "run_started",
      occurredAt: "2026-03-23T09:40:00.000Z",
      runId: "run-5",
      initialTask: {
        id: "task-5",
        kind: "recover-wait",
        input: {
          prompt: "Recover a satisfied wait",
        },
      },
    });
    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-2",
      type: "agent_spawned",
      occurredAt: "2026-03-23T09:40:01.000Z",
      runId: "run-5",
      agent: {
        id: "agent-5",
        taskId: "task-5",
        role: "worker",
      },
    });
    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-3",
      type: "wait_registered",
      occurredAt: "2026-03-23T09:40:02.000Z",
      runId: "run-5",
      wait: {
        id: "wait-5",
        agentId: "agent-5",
        kind: "agent-closed",
        description: "Recover after a crash between close and resolution",
        match: "all",
      },
    });
    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-4",
      type: "agent_closed",
      occurredAt: "2026-03-23T09:40:03.000Z",
      runId: "run-5",
      close: {
        id: "close-5",
        agentId: "agent-5",
        reason: "closed-before-crash",
      },
    });

    const recoveredManager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock("2026-03-23T09:41:00.000Z"),
    );

    expect(runtimeHarness.createCalls).toEqual([]);
    expect(recoveredManager.getSnapshot().waits["wait-5"]).toMatchObject({
      status: "resolved",
      resolution: {
        status: "agent_closed",
        match: "all",
        resolvedAgentIds: ["agent-5"],
        pendingAgentIds: [],
      },
    });
    await expect(OrchestrationStore.loadEvents(sessionDir)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "wait_resolved",
          waitId: "wait-5",
          resolution: expect.objectContaining({
            status: "agent_closed",
          }),
        }),
      ]),
    );
  });

  it("closes agents during recovery when mailbox state shows a pending close request", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();

    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-close-r1",
      type: "run_started",
      occurredAt: "2026-03-23T09:45:00.000Z",
      runId: "run-close-recovery",
      initialTask: {
        id: "task-close-recovery",
        kind: "recover-close-request",
        input: {
          prompt: "Recover after a close request was persisted",
        },
      },
    });
    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-close-r2",
      type: "agent_spawned",
      occurredAt: "2026-03-23T09:45:01.000Z",
      runId: "run-close-recovery",
      agent: {
        id: "agent-close-recovery",
        taskId: "task-close-recovery",
        role: "worker",
      },
    });
    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-close-r3",
      type: "wait_registered",
      occurredAt: "2026-03-23T09:45:02.000Z",
      runId: "run-close-recovery",
      wait: {
        id: "wait-close-recovery",
        agentId: "agent-close-recovery",
        kind: "agent-closed",
        description: "Resolve after mailbox close recovery",
        match: "all",
      },
    });
    await OrchestrationStore.writeMailboxState(sessionDir, "agent-close-recovery", {
      processedEventCount: 0,
      closeRequested: {
        occurredAt: "2026-03-23T09:45:03.000Z",
        reason: "shutdown-requested",
      },
    });

    const recoveredManager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock(
        "2026-03-23T09:45:04.000Z",
        "2026-03-23T09:45:05.000Z",
        "2026-03-23T09:45:06.000Z",
      ),
    );

    expect(runtimeHarness.createCalls).toEqual([]);
    expect(recoveredManager.getSnapshot().agents["agent-close-recovery"]).toMatchObject({
      status: "closed",
    });
    expect(recoveredManager.getSnapshot().waits["wait-close-recovery"]).toMatchObject({
      status: "resolved",
      resolution: {
        status: "agent_closed",
        resolvedAgentIds: ["agent-close-recovery"],
      },
    });
    await expect(OrchestrationStore.loadEvents(sessionDir)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "agent_closed",
          close: expect.objectContaining({
            agentId: "agent-close-recovery",
            reason: "shutdown-requested",
          }),
        }),
      ]),
    );
  });

  it("does not replay inputs that were durably acknowledged before restart", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();

    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-10",
      type: "run_started",
      occurredAt: "2026-03-23T09:50:00.000Z",
      runId: "run-6",
      initialTask: {
        id: "task-6",
        kind: "acknowledged-input",
        input: {
          prompt: "Recover after durable dequeue",
        },
      },
    });
    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-11",
      type: "agent_spawned",
      occurredAt: "2026-03-23T09:50:01.000Z",
      runId: "run-6",
      agent: {
        id: "agent-6",
        taskId: "task-6",
        role: "worker",
      },
    });
    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-12",
      type: "agent_input_queued",
      occurredAt: "2026-03-23T09:50:02.000Z",
      runId: "run-6",
      input: {
        id: "input-6",
        agentId: "agent-6",
        payload: {
          prompt: "already delivered",
        },
      },
    });
    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-13",
      type: "agent_input_removed",
      occurredAt: "2026-03-23T09:50:03.000Z",
      runId: "run-6",
      agentId: "agent-6",
      inputId: "input-6",
      reason: "delivered",
    });

    const recoveredManager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock("2026-03-23T09:51:00.000Z"),
    );

    expect(runtimeHarness.createCalls).toEqual([
      {
        agentId: "agent-6",
        runId: "run-6",
        role: "worker",
        taskId: "task-6",
      },
    ]);
    expect(runtimeHarness.instances.get("agent-6")?.deliveries).toEqual([]);
    expect(recoveredManager.getSnapshot().queuedInputs).toEqual([]);
  });

  it("reconstructs pending queued inputs from mailbox state when checkpoint queue is stale", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();

    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-mailbox-r1",
      type: "run_started",
      occurredAt: "2026-03-23T09:55:00.000Z",
      runId: "run-mailbox-recovery",
      initialTask: {
        id: "task-mailbox-recovery",
        kind: "recover-from-mailbox",
        input: {
          prompt: "Recover pending mailbox inputs even if the checkpoint queue is stale",
        },
      },
    });
    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-mailbox-r2",
      type: "agent_spawned",
      occurredAt: "2026-03-23T09:55:01.000Z",
      runId: "run-mailbox-recovery",
      agent: {
        id: "agent-mailbox-recovery",
        taskId: "task-mailbox-recovery",
        role: "worker",
      },
    });
    await OrchestrationStore.appendEvent(sessionDir, {
      eventId: "evt-mailbox-r3",
      type: "agent_input_queued",
      occurredAt: "2026-03-23T09:55:02.000Z",
      runId: "run-mailbox-recovery",
      input: {
        id: "input-mailbox-recovery",
        agentId: "agent-mailbox-recovery",
        payload: {
          prompt: "recover me from mailbox",
        },
      },
    });
    await OrchestrationStore.appendMailboxEvent(sessionDir, "agent-mailbox-recovery", {
      eventId: "mailbox-evt-1",
      type: "input_enqueued",
      agentId: "agent-mailbox-recovery",
      occurredAt: "2026-03-23T09:55:02.000Z",
      inputId: "input-mailbox-recovery",
      payload: {
        prompt: "recover me from mailbox",
      },
    });
    await OrchestrationStore.writeCheckpoint(sessionDir, {
      runs: {
        "run-mailbox-recovery": {
          id: "run-mailbox-recovery",
          status: "running",
          initialTaskId: "task-mailbox-recovery",
          createdAt: "2026-03-23T09:55:00.000Z",
          updatedAt: "2026-03-23T09:55:02.000Z",
        },
      },
      tasks: {
        "task-mailbox-recovery": {
          id: "task-mailbox-recovery",
          runId: "run-mailbox-recovery",
          kind: "recover-from-mailbox",
          input: {
            prompt: "Recover pending mailbox inputs even if the checkpoint queue is stale",
          },
          createdAt: "2026-03-23T09:55:00.000Z",
        },
      },
      agents: {
        "agent-mailbox-recovery": {
          id: "agent-mailbox-recovery",
          runId: "run-mailbox-recovery",
          taskId: "task-mailbox-recovery",
          role: "worker",
          status: "idle",
          createdAt: "2026-03-23T09:55:01.000Z",
          updatedAt: "2026-03-23T09:55:01.000Z",
        },
      },
      waits: {},
      queuedInputs: [],
      lastEventId: "evt-mailbox-r3",
    });

    const recoveredManager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock(
        "2026-03-23T09:56:00.000Z",
        "2026-03-23T09:56:01.000Z",
        "2026-03-23T09:56:02.000Z",
      ),
    );

    expect(runtimeHarness.createCalls).toEqual([
      {
        agentId: "agent-mailbox-recovery",
        runId: "run-mailbox-recovery",
        role: "worker",
        taskId: "task-mailbox-recovery",
      },
    ]);
    await expect
      .poll(() =>
        runtimeHarness.instances.get("agent-mailbox-recovery")?.deliveries.map((input) => input.id),
      )
      .toEqual(["input-mailbox-recovery"]);
    await expect.poll(() => recoveredManager.getSnapshot().queuedInputs).toEqual([]);
  });

  it("supports two concurrent runs on the same manager without interference", async () => {
    const sessionDir = await createSessionDir();
    const runtimeHarness = createRuntimeHarness();
    const manager = await createManager(
      sessionDir,
      runtimeHarness.runtime,
      createClock(
        "2026-03-23T12:00:00.000Z",
        "2026-03-23T12:00:01.000Z",
        "2026-03-23T12:00:02.000Z",
        "2026-03-23T12:00:03.000Z",
        "2026-03-23T12:00:04.000Z",
        "2026-03-23T12:00:05.000Z",
      ),
    );

    await manager.startRun({
      runId: "run-concurrent-a",
      initialTask: {
        id: "task-concurrent-a",
        kind: "concurrent-test",
        input: { prompt: "Run A" },
      },
    });
    await manager.startRun({
      runId: "run-concurrent-b",
      initialTask: {
        id: "task-concurrent-b",
        kind: "concurrent-test",
        input: { prompt: "Run B" },
      },
    });

    await manager.spawnAgent({
      id: "agent-concurrent-a",
      runId: "run-concurrent-a",
      taskId: "task-concurrent-a",
      role: "worker",
    });
    await manager.spawnAgent({
      id: "agent-concurrent-b",
      runId: "run-concurrent-b",
      taskId: "task-concurrent-b",
      role: "worker",
    });

    const snapshot = manager.getSnapshot();

    expect(Object.keys(snapshot.runs)).toEqual(
      expect.arrayContaining(["run-concurrent-a", "run-concurrent-b"]),
    );
    expect(snapshot.runs["run-concurrent-a"]?.status).toBe("running");
    expect(snapshot.runs["run-concurrent-b"]?.status).toBe("running");
    expect(snapshot.agents["agent-concurrent-a"]?.runId).toBe("run-concurrent-a");
    expect(snapshot.agents["agent-concurrent-b"]?.runId).toBe("run-concurrent-b");

    await manager.completeRun({ runId: "run-concurrent-a", status: "completed" });

    const afterCompleteA = manager.getSnapshot();
    expect(afterCompleteA.runs["run-concurrent-a"]?.status).toBe("completed");
    expect(afterCompleteA.runs["run-concurrent-b"]?.status).toBe("running");

    await manager.completeRun({ runId: "run-concurrent-b", status: "completed" });

    const afterBothComplete = manager.getSnapshot();
    expect(afterBothComplete.runs["run-concurrent-a"]?.status).toBe("completed");
    expect(afterBothComplete.runs["run-concurrent-b"]?.status).toBe("completed");
  });
});
