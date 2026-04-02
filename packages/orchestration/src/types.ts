/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

export type RunStatus = "running" | "completed" | "failed";

export type AgentStatus = "idle" | "running" | "waiting" | "closing" | "closed";

export type WaitStatus = "pending" | "resolved";

export type WaitMatch = "any" | "all";

export type AgentJobOutcome =
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export interface OrchestrationAgentJob {
  jobId: string;
  inputIds: string[];
  outcome: AgentJobOutcome;
  outputText?: string;
  error?: string;
  completedAt: string;
}

export interface OrchestrationTask {
  id: string;
  runId: string;
  kind: string;
  input: Record<string, unknown>;
  createdAt: string;
}

export interface OrchestrationRun {
  id: string;
  status: RunStatus;
  initialTaskId: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface OrchestrationAgent {
  id: string;
  runId: string;
  taskId: string;
  displayName?: string;
  role: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  lastJob?: OrchestrationAgentJob;
}

export interface WaitCondition {
  id: string;
  runId: string;
  agentId: string;
  agentIds?: string[];
  kind: string;
  description: string;
  match?: WaitMatch;
  status: WaitStatus;
  registeredAt: string;
  timeoutAt?: string;
  resolvedAt?: string;
  resolution?: Record<string, unknown>;
}

export interface SpawnAgentInput {
  id: string;
  runId: string;
  taskId?: string;
  displayName?: string;
  role: string;
}

export interface SendInputInput {
  id: string;
  agentId: string;
  payload: Record<string, unknown>;
}

export interface RemoveInputInput {
  inputId: string;
  agentId: string;
  reason: "delivered" | "agent_closed";
}

export interface WaitAgentInput {
  id: string;
  agentId: string;
  agentIds?: string[];
  kind: string;
  description: string;
  match?: WaitMatch;
  timeoutAt?: string;
}

export interface CloseAgentInput {
  id: string;
  agentId: string;
  reason?: string;
}

export interface AgentInputEnvelope {
  id: string;
  agentId: string;
  payload: Record<string, unknown>;
  queuedAt: string;
}

export interface ManagedAgentDeliveryResult {
  jobId: string;
  consumedInputIds: string[];
  outcome: AgentJobOutcome;
  outputText?: string;
  error?: string;
}

export type OrchestrationMailboxEvent =
  | {
      eventId: string;
      type: "input_enqueued";
      agentId: string;
      occurredAt: string;
      inputId: string;
      payload: Record<string, unknown>;
    }
  | {
      eventId: string;
      type: "agent_close_requested";
      agentId: string;
      occurredAt: string;
      reason?: string;
    };

export interface OrchestrationMailboxState {
  processedEventCount: number;
  closeRequested: {
    reason?: string;
    occurredAt: string;
  } | null;
}

interface OrchestrationEventBase {
  eventId: string;
  occurredAt: string;
  runId: string;
}

export type OrchestrationEvent =
  | (OrchestrationEventBase & {
      type: "run_started";
      initialTask: {
        id: string;
        kind: string;
        input: Record<string, unknown>;
      };
    })
  | (OrchestrationEventBase & {
      type: "agent_spawned";
      agent: SpawnAgentInput;
    })
  | (OrchestrationEventBase & {
      type: "agent_input_queued";
      input: SendInputInput;
    })
  | (OrchestrationEventBase & {
      type: "agent_input_removed";
      inputId: string;
      agentId: string;
      reason: RemoveInputInput["reason"];
    })
  | (OrchestrationEventBase & {
      type: "agent_status_changed";
      agentId: string;
      status: AgentStatus;
    })
  | (OrchestrationEventBase & {
      type: "agent_job_started";
      agentId: string;
      jobId: string;
      inputIds: string[];
    })
  | (OrchestrationEventBase & {
      type: "agent_job_completed";
      agentId: string;
      job: Omit<OrchestrationAgentJob, "completedAt">;
    })
  | (OrchestrationEventBase & {
      type: "agent_job_failed";
      agentId: string;
      job: Omit<OrchestrationAgentJob, "completedAt">;
    })
  | (OrchestrationEventBase & {
      type: "wait_registered";
      wait: WaitAgentInput;
    })
  | (OrchestrationEventBase & {
      type: "wait_resolved";
      waitId: string;
      resolution?: Record<string, unknown>;
    })
  | (OrchestrationEventBase & {
      type: "agent_closed";
      close: CloseAgentInput;
    })
  | (OrchestrationEventBase & {
      type: "run_completed";
      status: Extract<RunStatus, "completed" | "failed">;
      error?: string;
    });

export interface OrchestrationSnapshot {
  runs: Record<string, OrchestrationRun>;
  tasks: Record<string, OrchestrationTask>;
  agents: Record<string, OrchestrationAgent>;
  waits: Record<string, WaitCondition>;
  queuedInputs: AgentInputEnvelope[];
  lastEventId?: string;
}
