/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { RuntimeEvent } from "@agentrail/runtime-core";
import type { ExtendedSseEvent } from "@agentrail/skills";
import type { OrchestrationEvent } from "@agentrail/orchestration";

export interface AgentrailContextCompactionStartEvent {
  type: "context_compaction_start";
}

export interface AgentrailContextCompactionEndEvent {
  type: "context_compaction_end";
}

export interface AgentrailContextUsageEvent {
  type: "context_usage";
  inputTokens: number;
  outputTokens: number;
  budgetUsedPct?: number;
}

export interface AgentrailErrorEvent {
  type: "error";
  error: {
    message: string;
  };
}

export interface AgentrailOrchestrationRunStartEvent {
  type: "orchestration_run_start";
  runId: string;
  initialTask: Record<string, unknown>;
}

export interface AgentrailOrchestrationRunCompleteEvent {
  type: "orchestration_run_complete";
  runId: string;
  status: string;
  error?: unknown;
}

export interface AgentrailSubagentSpawnedEvent {
  type: "subagent_spawned";
  agent: Record<string, unknown>;
}

export interface AgentrailSubagentStatusEvent {
  type: "subagent_status";
  agentId: string;
  status: string;
}

export interface AgentrailSubagentJobStartedEvent {
  type: "subagent_job_started";
  agentId: string;
  jobId: string;
  inputIds: string[];
}

export interface AgentrailSubagentJobCompletedEvent {
  type: "subagent_job_completed";
  agentId: string;
  job: Record<string, unknown>;
}

export interface AgentrailSubagentJobFailedEvent {
  type: "subagent_job_failed";
  agentId: string;
  job: Record<string, unknown>;
}

export interface AgentrailSubagentMessageEvent {
  type: "subagent_message";
  agentId: string;
  input: unknown;
}

export interface AgentrailWaitRegisteredEvent {
  type: "wait_registered";
  wait: unknown;
}

export interface AgentrailWaitResolvedEvent {
  type: "wait_resolved";
  waitId: string;
  resolution: unknown;
}

export interface AgentrailSubagentClosedEvent {
  type: "subagent_closed";
  agentId: string;
  reason?: string;
  finalStatus?: string;
}

export type AgentrailHostEvent =
  | AgentrailContextCompactionStartEvent
  | AgentrailContextCompactionEndEvent
  | AgentrailContextUsageEvent
  | AgentrailErrorEvent
  | AgentrailOrchestrationRunStartEvent
  | AgentrailOrchestrationRunCompleteEvent
  | AgentrailSubagentSpawnedEvent
  | AgentrailSubagentStatusEvent
  | AgentrailSubagentJobStartedEvent
  | AgentrailSubagentJobCompletedEvent
  | AgentrailSubagentJobFailedEvent
  | AgentrailSubagentMessageEvent
  | AgentrailWaitRegisteredEvent
  | AgentrailWaitResolvedEvent
  | AgentrailSubagentClosedEvent;

export type AgentrailEvent = RuntimeEvent | ExtendedSseEvent | AgentrailHostEvent;

export function mapOrchestrationEvent(
  event: OrchestrationEvent,
): AgentrailHostEvent | null {
  switch (event.type) {
    case "run_started":
      return {
        type: "orchestration_run_start",
        runId: event.runId,
        initialTask: event.initialTask,
      };
    case "agent_spawned":
      return {
        type: "subagent_spawned",
        agent: {
          ...event.agent,
          createdAt: event.occurredAt,
        },
      };
    case "agent_status_changed":
      return {
        type: "subagent_status",
        agentId: event.agentId,
        status: event.status,
      };
    case "agent_job_started":
      return {
        type: "subagent_job_started",
        agentId: event.agentId,
        jobId: event.jobId,
        inputIds: event.inputIds,
      };
    case "agent_job_completed":
      return {
        type: "subagent_job_completed",
        agentId: event.agentId,
        job: event.job,
      };
    case "agent_job_failed":
      return {
        type: "subagent_job_failed",
        agentId: event.agentId,
        job: event.job,
      };
    case "agent_input_queued":
      return {
        type: "subagent_message",
        agentId: event.input.agentId,
        input: event.input,
      };
    case "wait_registered":
      return {
        type: "wait_registered",
        wait: event.wait,
      };
    case "wait_resolved":
      return {
        type: "wait_resolved",
        waitId: event.waitId,
        resolution: event.resolution,
      };
    case "agent_closed":
      return {
        type: "subagent_closed",
        agentId: event.close.agentId,
        reason: event.close.reason,
        finalStatus: "closed",
      };
    case "run_completed":
      return {
        type: "orchestration_run_complete",
        runId: event.runId,
        status: event.status,
        error: event.error,
      };
    case "agent_input_removed":
      return null;
    default:
      return null;
  }
}
