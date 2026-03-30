/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  OrchestrationAgent,
  OrchestrationEvent,
  OrchestrationState,
  OrchestrationStreamEvent,
  WaitCondition,
} from "../types/orchestration.js";

function getEventTimestamp(event: { timestamp?: string }): string {
  return event.timestamp ?? new Date().toISOString();
}

function appendEvent(
  state: OrchestrationState,
  event: OrchestrationEvent,
): OrchestrationState {
  return {
    ...state,
    events: [...state.events, event],
  };
}

function toEventRecord(
  event: OrchestrationStreamEvent,
  overrides: Record<string, unknown> = {},
): OrchestrationEvent {
  return {
    ...event,
    id: createEventId(),
    timestamp: getEventTimestamp(event),
    ...overrides,
  };
}

function createEventId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createStateFromEvent(
  event: OrchestrationStreamEvent,
): OrchestrationState | null {
  const timestamp = getEventTimestamp(event);
  const baseState: OrchestrationState = {
    run: null,
    agents: [],
    waits: [],
    events: [toEventRecord(event)],
  };

  switch (event.type) {
    case "orchestration_run_start":
      return {
        ...baseState,
        run: {
          id: event.runId,
          status: "running",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      };

    case "subagent_spawned":
      return {
        ...baseState,
        agents: [
          {
            id: event.agent.id,
            displayName: event.agent.displayName,
            role: event.agent.role,
            status: event.agent.status,
            createdAt: event.agent.createdAt,
            updatedAt: event.agent.updatedAt ?? timestamp,
            lastJob: event.agent.lastJob,
            mailbox: event.agent.mailbox,
          },
        ],
      };

    default:
      return null;
  }
}

export function applyEventToState(
  state: OrchestrationState,
  event: OrchestrationStreamEvent,
): OrchestrationState {
  const timestamp = getEventTimestamp(event);

  switch (event.type) {
    case "orchestration_run_start": {
      return appendEvent(
        {
          ...state,
          run: {
            id: event.runId,
            status: "running",
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        },
        toEventRecord(event),
      );
    }

    case "subagent_spawned": {
      const newAgent: OrchestrationAgent = {
        id: event.agent.id,
        displayName: event.agent.displayName,
        role: event.agent.role,
        status: event.agent.status,
        createdAt: event.agent.createdAt,
        updatedAt: event.agent.updatedAt ?? timestamp,
        lastJob: event.agent.lastJob,
        mailbox: event.agent.mailbox,
      };
      return appendEvent(
        {
          ...state,
          agents: state.agents.some((agent) => agent.id === newAgent.id)
            ? state.agents.map((agent) =>
                agent.id === newAgent.id ? { ...agent, ...newAgent } : agent,
              )
            : [...state.agents, newAgent],
        },
        toEventRecord(event, {
          agentId: event.agent.id,
          displayName: event.agent.displayName,
          role: event.agent.role,
        }),
      );
    }

    case "subagent_status": {
      return appendEvent(
        {
          ...state,
          agents: state.agents.map((agent) =>
            agent.id === event.agentId
              ? {
                  ...agent,
                  status: event.status,
                  updatedAt: timestamp,
                  activeJob:
                    event.status === "idle" || event.status === "closed"
                      ? undefined
                      : agent.activeJob,
                }
              : agent,
          ),
        },
        toEventRecord(event),
      );
    }

    case "subagent_job_started": {
      return appendEvent(
        {
          ...state,
          agents: state.agents.map((agent) =>
            agent.id === event.agentId
              ? {
                  ...agent,
                  activeJob: {
                    jobId: event.jobId,
                    inputIds: event.inputIds,
                    startedAt: timestamp,
                  },
                  updatedAt: timestamp,
                }
              : agent,
          ),
        },
        toEventRecord(event),
      );
    }

    case "subagent_job_completed":
    case "subagent_job_failed": {
      return appendEvent(
        {
          ...state,
          agents: state.agents.map((agent) =>
            agent.id === event.agentId
              ? {
                  ...agent,
                  lastJob: {
                    ...event.job,
                    completedAt: timestamp,
                  },
                  updatedAt: timestamp,
                }
              : agent,
          ),
        },
        toEventRecord(event),
      );
    }

    case "subagent_message": {
      return appendEvent(
        {
          ...state,
          agents: state.agents.map((agent) =>
            agent.id === event.agentId
              ? { ...agent, updatedAt: timestamp }
              : agent,
          ),
        },
        toEventRecord(event),
      );
    }

    case "wait_registered": {
      const newWait: WaitCondition = {
        id: event.wait.id,
        agentIds: event.wait.agentIds,
        mode: event.wait.mode,
        status: event.wait.status,
        createdAt: timestamp,
      };
      return appendEvent(
        {
          ...state,
          waits: state.waits.some((wait) => wait.id === newWait.id)
            ? state.waits.map((wait) =>
                wait.id === newWait.id ? { ...wait, ...newWait } : wait,
              )
            : [...state.waits, newWait],
        },
        toEventRecord(event),
      );
    }

    case "wait_resolved": {
      return appendEvent(
        {
          ...state,
          waits: state.waits.map((wait) =>
            wait.id === event.waitId
              ? {
                  ...wait,
                  status:
                    event.timedOut ? "timeout" : "resolved",
                  resolvedAt: timestamp,
                }
              : wait,
          ),
        },
        toEventRecord(event),
      );
    }

    case "subagent_closed": {
      return appendEvent(
        {
          ...state,
          agents: state.agents.map((agent) =>
            agent.id === event.agentId
              ? {
                  ...agent,
                  status: "closed",
                  closedAt: timestamp,
                  updatedAt: timestamp,
                  activeJob: undefined,
                }
              : agent,
          ),
        },
        toEventRecord(event, {
          finalStatus: "closed",
        }),
      );
    }

    case "orchestration_run_complete": {
      return appendEvent(
        {
          ...state,
          run: state.run
            ? {
                ...state.run,
                status: event.status,
                updatedAt: timestamp,
              }
            : null,
        },
        toEventRecord(event),
      );
    }

    default:
      return state;
  }
}

export function normalizeHistoryEvents(
  events: OrchestrationEvent[],
): OrchestrationEvent[] {
  return events.map((event) => ({
    ...event,
    id:
      typeof event.id === "string"
        ? event.id
        : typeof (event as unknown as { eventId?: unknown }).eventId === "string"
          ? String((event as unknown as { eventId: string }).eventId)
          : createEventId(),
    timestamp:
      typeof event.timestamp === "string"
        ? event.timestamp
        : typeof (event as unknown as { occurredAt?: unknown }).occurredAt === "string"
          ? String((event as unknown as { occurredAt: string }).occurredAt)
          : new Date().toISOString(),
  }));
}

export const applyEventToStateForTest = applyEventToState;
