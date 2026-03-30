/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/**
 * Orchestration types for Agent Team UI state management.
 *
 * These types mirror the server-side orchestration domain model
 * but are tailored for frontend consumption.
 */

/** Represents a single orchestration run */
export interface OrchestrationRun {
  id: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
}

/** Sub-agent state as displayed in the UI */
export interface OrchestrationAgent {
  id: string;
  displayName?: string;
  role: string;
  status: "idle" | "running" | "waiting" | "closing" | "closed";
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  lastJob?: {
    jobId: string;
    inputIds: string[];
    outcome: "completed" | "failed" | "cancelled" | "timed_out";
    outputText?: string;
    error?: string;
    completedAt: string;
  };
  activeJob?: {
    jobId: string;
    inputIds: string[];
    startedAt: string;
  };
  mailbox?: {
    processedEventCount: number;
    closeRequested: {
      reason?: string;
      occurredAt: string;
    } | null;
  };
}

/** Wait condition state */
export interface WaitCondition {
  id: string;
  agentIds: string[];
  mode: "any" | "all";
  status: "pending" | "resolved" | "timeout";
  createdAt: string;
  resolvedAt?: string;
}

/** Base interface for all orchestration events */
export interface OrchestrationEventBase {
  id: string;
  type: string;
  timestamp: string;
  [key: string]: unknown;
}

/** Event fired when a run starts */
export interface RunStartEvent extends OrchestrationEventBase {
  type: "run_started";
  runId: string;
  initialTask: {
    description: string;
    [key: string]: unknown;
  };
}

/** Event fired when an agent is spawned */
export interface AgentSpawnedEvent extends OrchestrationEventBase {
  type: "agent_spawned";
  runId: string;
  agentId: string;
  displayName?: string;
  role: string;
  prompt: string;
}

/** Event fired when agent status changes */
export interface AgentStatusChangedEvent extends OrchestrationEventBase {
  type: "agent_status_changed";
  runId: string;
  agentId: string;
  status: "idle" | "running" | "waiting" | "closed";
  previousStatus: string;
}

/** Event fired when input is queued for an agent */
export interface AgentInputQueuedEvent extends OrchestrationEventBase {
  type: "agent_input_queued";
  runId: string;
  agentId: string;
  input: {
    type: string;
    content: unknown;
  };
}

/** Event fired when a wait condition is registered */
export interface WaitRegisteredEvent extends OrchestrationEventBase {
  type: "wait_registered";
  runId: string;
  waitId: string;
  agentIds: string[];
  mode: "any" | "all";
  timeoutMs?: number;
}

/** Event fired when a wait condition is resolved */
export interface WaitResolvedEvent extends OrchestrationEventBase {
  type: "wait_resolved";
  runId: string;
  waitId: string;
  resolution?: {
    agentId: string;
    result: unknown;
  };
  timedOut: boolean;
}

/** Event fired when an agent is closed */
export interface AgentClosedEvent extends OrchestrationEventBase {
  type: "agent_closed";
  runId: string;
  agentId: string;
  reason?: string;
  finalStatus: string;
}

/** Event fired when a run completes */
export interface RunCompletedEvent extends OrchestrationEventBase {
  type: "run_completed";
  runId: string;
  status: "completed" | "failed";
  summary?: string;
}

/** Union of all orchestration event types */
export type OrchestrationEvent =
  | RunStartEvent
  | AgentSpawnedEvent
  | AgentStatusChangedEvent
  | AgentInputQueuedEvent
  | WaitRegisteredEvent
  | WaitResolvedEvent
  | AgentClosedEvent
  | RunCompletedEvent
  | OrchestrationEventBase;

/** SSE stream events for orchestration (snake_case as sent by server) */
export interface OrchestrationRunStartStreamEvent {
  type: "orchestration_run_start";
  runId: string;
  initialTask: {
    description: string;
    [key: string]: unknown;
  };
  timestamp: string;
}

export interface SubagentSpawnedStreamEvent {
  type: "subagent_spawned";
  agent: {
    id: string;
    displayName?: string;
    role: string;
    status: "idle" | "running" | "waiting" | "closing" | "closed";
    createdAt: string;
    updatedAt?: string;
    lastJob?: OrchestrationAgent["lastJob"];
    mailbox?: OrchestrationAgent["mailbox"];
  };
  timestamp?: string;
}

export interface SubagentStatusStreamEvent {
  type: "subagent_status";
  agentId: string;
  status: "idle" | "running" | "waiting" | "closing" | "closed";
  previousStatus?: string;
  timestamp?: string;
}

export interface SubagentJobStartedStreamEvent {
  type: "subagent_job_started";
  agentId: string;
  jobId: string;
  inputIds: string[];
  timestamp?: string;
}

export interface SubagentJobCompletedStreamEvent {
  type: "subagent_job_completed";
  agentId: string;
  job: Omit<NonNullable<OrchestrationAgent["lastJob"]>, "completedAt">;
  timestamp?: string;
}

export interface SubagentJobFailedStreamEvent {
  type: "subagent_job_failed";
  agentId: string;
  job: Omit<NonNullable<OrchestrationAgent["lastJob"]>, "completedAt">;
  timestamp?: string;
}

export interface SubagentMessageStreamEvent {
  type: "subagent_message";
  agentId: string;
  input: {
    type: string;
    content: unknown;
  };
  timestamp?: string;
}

export interface WaitRegisteredStreamEvent {
  type: "wait_registered";
  wait: {
    id: string;
    agentIds: string[];
    mode: "any" | "all";
    status: "pending" | "resolved" | "timeout";
  };
  timestamp?: string;
}

export interface WaitResolvedStreamEvent {
  type: "wait_resolved";
  waitId: string;
  resolution?: {
    agentId: string;
    result: unknown;
  };
  timedOut: boolean;
  timestamp?: string;
}

export interface SubagentClosedStreamEvent {
  type: "subagent_closed";
  agentId: string;
  reason?: string;
  finalStatus: string;
  timestamp?: string;
}

export interface OrchestrationRunCompleteStreamEvent {
  type: "orchestration_run_complete";
  runId: string;
  status: "completed" | "failed";
  summary?: string;
  timestamp?: string;
}

/** Union of all orchestration SSE stream event types */
export type OrchestrationStreamEvent =
  | OrchestrationRunStartStreamEvent
  | SubagentSpawnedStreamEvent
  | SubagentStatusStreamEvent
  | SubagentJobStartedStreamEvent
  | SubagentJobCompletedStreamEvent
  | SubagentJobFailedStreamEvent
  | SubagentMessageStreamEvent
  | WaitRegisteredStreamEvent
  | WaitResolvedStreamEvent
  | SubagentClosedStreamEvent
  | OrchestrationRunCompleteStreamEvent;

/** Complete orchestration state for a session */
export interface OrchestrationState {
  run: OrchestrationRun | null;
  agents: OrchestrationAgent[];
  waits: WaitCondition[];
  events: OrchestrationEvent[];
}

/** API response from /api/sessions/:sessionId/orchestration */
export interface OrchestrationHistoryResponse {
  run: {
    id: string;
    status: "running" | "completed" | "failed";
    createdAt: string;
    updatedAt: string;
  } | null;
  agents: Array<{
    id: string;
    displayName?: string;
    role: string;
    status: "idle" | "running" | "waiting" | "closing" | "closed";
    createdAt: string;
    updatedAt: string;
    closedAt?: string;
    lastJob?: OrchestrationAgent["lastJob"];
    mailbox?: OrchestrationAgent["mailbox"];
  }>;
  events: OrchestrationEvent[];
}
