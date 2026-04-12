/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  OrchestrationAgent,
  OrchestrationEvent,
  OrchestrationSnapshot,
  OrchestrationTask,
  WaitCondition,
} from "@/orchestration/types.js";

/** Recovered orchestration state plus resumable runtime handles. */
export interface RecoveredOrchestrationState {
  snapshot: OrchestrationSnapshot;
  pendingWaits: WaitCondition[];
  activeAgents: OrchestrationAgent[];
}

/** Rebuilds orchestration state from a snapshot checkpoint and event log tail. */
export function recoverOrchestrationState(
  snapshot: OrchestrationSnapshot | null,
  events: OrchestrationEvent[],
): RecoveredOrchestrationState {
  const { baseSnapshot, tailEvents } = getRecoveryReplayInputs(snapshot, events);
  const recoveredSnapshot = replayEvents(baseSnapshot, tailEvents);
  const resumable = isRunResumable(recoveredSnapshot);

  return {
    snapshot: recoveredSnapshot,
    pendingWaits: resumable
      ? Object.values(recoveredSnapshot.waits).filter((wait) => wait.status === "pending")
      : [],
    activeAgents: resumable
      ? Object.values(recoveredSnapshot.agents).filter((agent) => agent.status !== "closed")
      : [],
  };
}

function replayEvents(
  baseSnapshot: OrchestrationSnapshot | null,
  events: OrchestrationEvent[],
): OrchestrationSnapshot {
  const snapshot = cloneOrchestrationSnapshot(baseSnapshot);

  for (const event of events) {
    applyOrchestrationEvent(snapshot, event);
  }

  return snapshot;
}

function getRecoveryReplayInputs(
  snapshot: OrchestrationSnapshot | null,
  events: OrchestrationEvent[],
): {
  baseSnapshot: OrchestrationSnapshot | null;
  tailEvents: OrchestrationEvent[];
} {
  const lastEventId = snapshot?.lastEventId;

  if (!lastEventId) {
    return {
      baseSnapshot: snapshot,
      tailEvents: events,
    };
  }

  const lastCheckpointedIndex = events.findIndex((event) => event.eventId === lastEventId);

  if (lastCheckpointedIndex === -1) {
    if (events.length === 0) {
      return {
        baseSnapshot: snapshot,
        tailEvents: [],
      };
    }

    return {
      baseSnapshot: null,
      tailEvents: events,
    };
  }

  return {
    baseSnapshot: snapshot,
    tailEvents: events.slice(lastCheckpointedIndex + 1),
  };
}

/** Creates a deep clone of a snapshot or an empty snapshot when none exists. */
export function cloneOrchestrationSnapshot(
  snapshot: OrchestrationSnapshot | null,
): OrchestrationSnapshot {
  if (snapshot) {
    return JSON.parse(JSON.stringify(snapshot)) as OrchestrationSnapshot;
  }

  return createEmptyOrchestrationSnapshot();
}

function isRunResumable(snapshot: OrchestrationSnapshot): boolean {
  const runs = Object.values(snapshot.runs);
  if (runs.length === 0) return true;
  return runs.some((run) => run.status !== "completed" && run.status !== "failed");
}

/** Creates a brand-new empty orchestration snapshot. */
export function createEmptyOrchestrationSnapshot(): OrchestrationSnapshot {
  return {
    runs: {},
    tasks: {},
    agents: {},
    waits: {},
    queuedInputs: [],
  };
}

/** Applies one orchestration event to a mutable snapshot in place. */
export function applyOrchestrationEvent(
  snapshot: OrchestrationSnapshot,
  event: OrchestrationEvent,
): void {
  switch (event.type) {
    case "run_started": {
      const task: OrchestrationTask = {
        id: event.initialTask.id,
        runId: event.runId,
        kind: event.initialTask.kind,
        input: event.initialTask.input,
        createdAt: event.occurredAt,
      };

      snapshot.runs[event.runId] = {
        id: event.runId,
        status: "running",
        initialTaskId: task.id,
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
      };
      snapshot.tasks[task.id] = task;
      break;
    }
    case "agent_spawned": {
      const taskId =
        event.agent.taskId ?? snapshot.runs[event.runId]?.initialTaskId ?? event.agent.id;
      snapshot.agents[event.agent.id] = {
        id: event.agent.id,
        runId: event.runId,
        taskId,
        displayName: event.agent.displayName,
        role: event.agent.role,
        status: "idle",
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
        chainId: event.agent.chainId,
        depth: event.agent.depth,
      };
      break;
    }
    case "agent_input_queued": {
      snapshot.queuedInputs.push({
        id: event.input.id,
        agentId: event.input.agentId,
        payload: event.input.payload,
        queuedAt: event.occurredAt,
      });
      break;
    }
    case "agent_input_removed": {
      snapshot.queuedInputs = snapshot.queuedInputs.filter((input) => input.id !== event.inputId);
      break;
    }
    case "agent_status_changed": {
      const agent = snapshot.agents[event.agentId];

      if (agent) {
        agent.status = event.status;
        agent.updatedAt = event.occurredAt;
      }
      break;
    }
    case "agent_job_started": {
      const agent = snapshot.agents[event.agentId];

      if (agent) {
        agent.updatedAt = event.occurredAt;
      }
      break;
    }
    case "agent_job_completed": {
      const agent = snapshot.agents[event.agentId];

      if (agent) {
        agent.lastJob = {
          ...event.job,
          completedAt: event.occurredAt,
        };
        agent.updatedAt = event.occurredAt;
      }
      break;
    }
    case "agent_job_failed": {
      const agent = snapshot.agents[event.agentId];

      if (agent) {
        agent.lastJob = {
          ...event.job,
          completedAt: event.occurredAt,
        };
        agent.updatedAt = event.occurredAt;
      }
      break;
    }
    case "wait_registered": {
      snapshot.waits[event.wait.id] = {
        id: event.wait.id,
        runId: event.runId,
        agentId: event.wait.agentId,
        agentIds: event.wait.agentIds,
        kind: event.wait.kind,
        description: event.wait.description,
        match: event.wait.match,
        status: "pending",
        registeredAt: event.occurredAt,
        timeoutAt: event.wait.timeoutAt,
      };
      break;
    }
    case "wait_resolved": {
      const wait = snapshot.waits[event.waitId];

      if (wait) {
        wait.status = "resolved";
        wait.resolvedAt = event.occurredAt;
        wait.resolution = event.resolution;
      }
      break;
    }
    case "agent_closed": {
      const agent = snapshot.agents[event.close.agentId];

      if (agent) {
        agent.status = "closed";
        agent.updatedAt = event.occurredAt;
        agent.closedAt = event.occurredAt;
      }
      break;
    }
    case "run_completed": {
      const run = snapshot.runs[event.runId];
      if (run) {
        run.status = event.status;
        run.updatedAt = event.occurredAt;
        run.completedAt = event.occurredAt;
      }
      break;
    }
    default: {
      assertNever(event);
    }
  }

  snapshot.lastEventId = event.eventId;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled orchestration event: ${JSON.stringify(value)}`);
}
