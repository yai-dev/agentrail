/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { ToolResultContent } from "@agentrail/core";

/**
 * A JSON-serializable value.
 * Constraining `details` to this type ensures orchestration persistence
 * (which uses bare JSON.stringify) never receives non-serializable payloads
 * such as BigInt or circular references.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Lifecycle status for an orchestration run. */
export type RunStatus = "running" | "completed" | "failed";

/** Lifecycle status for a managed sub-agent. */
export type AgentStatus = "idle" | "running" | "waiting" | "closing" | "closed";

/** Resolution status for a wait condition. */
export type WaitStatus = "pending" | "resolved";

/** How multi-agent wait targets should be matched. */
export type WaitMatch = "any" | "all";

/** Final outcome recorded for one managed-agent job. */
export type AgentJobOutcome = "completed" | "failed" | "cancelled" | "timed_out";

/** A single tool call made by a sub-agent, including its input and output. */
export interface AgentToolCallRecord {
  /** Provider-assigned identifier for this tool call. */
  toolCallId: string;
  /** Name of the tool that was invoked. */
  toolName: string;
  /** Parsed arguments supplied by the model. */
  input: Record<string, unknown>;
  /**
   * Result returned by the tool.
   * `content` carries the model-visible text/image blocks.
   * `details` carries the machine-readable structured payload preserved for host code.
   */
  output:
    | {
        content: ToolResultContent[];
        /** JSON-safe snapshot of the tool's machine-readable payload. */
        details?: JsonValue;
      }
    | undefined;
}

/** Recorded output for one completed managed-agent job. */
export interface OrchestrationAgentJob {
  jobId: string;
  inputIds: string[];
  outcome: AgentJobOutcome;
  outputText?: string;
  error?: string;
  /** Tool calls made by the sub-agent during this job, in execution order. */
  toolCalls?: AgentToolCallRecord[];
  completedAt: string;
}

/** Task metadata tracked within an orchestration run. */
export interface OrchestrationTask {
  id: string;
  runId: string;
  kind: string;
  input: Record<string, unknown>;
  createdAt: string;
}

/** Top-level orchestration run record. */
export interface OrchestrationRun {
  id: string;
  status: RunStatus;
  initialTaskId: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/** Managed sub-agent record persisted in the orchestration snapshot. */
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

/** Wait condition registered by a managed agent. */
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

/** Input required to spawn a managed agent. */
export interface SpawnAgentInput {
  id: string;
  runId: string;
  taskId?: string;
  displayName?: string;
  role: string;
  /** Shared correlation ID for the entire request chain (root + descendants). */
  chainId?: string;
  /** Sub-agent nesting depth within the multi-agent hierarchy. */
  depth?: number;
}

/** Input queued for delivery to a managed agent. */
export interface SendInputInput {
  id: string;
  agentId: string;
  payload: Record<string, unknown>;
}

/** Event payload used when removing queued input from an agent mailbox. */
export interface RemoveInputInput {
  inputId: string;
  agentId: string;
  reason: "delivered" | "agent_closed";
}

/** Input required to register a wait condition. */
export interface WaitAgentInput {
  id: string;
  agentId: string;
  agentIds?: string[];
  kind: string;
  description: string;
  match?: WaitMatch;
  timeoutAt?: string;
}

/** Input used when closing a managed agent. */
export interface CloseAgentInput {
  id: string;
  agentId: string;
  reason?: string;
}

/** Persisted queued-input envelope for a managed agent. */
export interface AgentInputEnvelope {
  id: string;
  agentId: string;
  payload: Record<string, unknown>;
  queuedAt: string;
}

/** Normalized result returned when a managed agent finishes processing input. */
export interface ManagedAgentDeliveryResult {
  jobId: string;
  consumedInputIds: string[];
  outcome: AgentJobOutcome;
  outputText?: string;
  error?: string;
  /** Tool calls made by the sub-agent during this job, in execution order. */
  toolCalls?: AgentToolCallRecord[];
}

/** Mailbox events persisted separately for durable agent input delivery. */
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

/** Derived mailbox state for one managed agent. */
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

/** Event log union used to rebuild orchestration state. */
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

/** Serializable snapshot of all active orchestration state for a session. */
export interface OrchestrationSnapshot {
  runs: Record<string, OrchestrationRun>;
  tasks: Record<string, OrchestrationTask>;
  agents: Record<string, OrchestrationAgent>;
  waits: Record<string, WaitCondition>;
  queuedInputs: AgentInputEnvelope[];
  lastEventId?: string;
}
