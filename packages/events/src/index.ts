/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { RuntimeEvent } from "@agentrail/runtime-core";
import type { ExtendedSseEvent } from "@agentrail/skills";
import type { OrchestrationEvent } from "@agentrail/orchestration";

/** Event emitted before chat history compaction starts. */
export interface AgentrailContextCompactionStartEvent {
  type: "context_compaction_start";
}

/** Event emitted after chat history compaction finishes. */
export interface AgentrailContextCompactionEndEvent {
  type: "context_compaction_end";
}

/** Event describing request-time token usage against the context budget. */
export interface AgentrailContextUsageEvent {
  type: "context_usage";
  inputTokens: number;
  outputTokens: number;
  budgetUsedPct?: number;
}

/** Generic host-layer error event forwarded to stream consumers. */
export interface AgentrailErrorEvent {
  type: "error";
  error: {
    message: string;
  };
}

/** Event emitted when an orchestration run starts. */
export interface AgentrailOrchestrationRunStartEvent {
  type: "orchestration_run_start";
  runId: string;
  initialTask: Record<string, unknown>;
}

/** Event emitted when an orchestration run completes. */
export interface AgentrailOrchestrationRunCompleteEvent {
  type: "orchestration_run_complete";
  runId: string;
  status: string;
  error?: unknown;
}

/** Event emitted when a sub-agent is created. */
export interface AgentrailSubagentSpawnedEvent {
  type: "subagent_spawned";
  agent: Record<string, unknown>;
}

/** Event emitted when a sub-agent status changes. */
export interface AgentrailSubagentStatusEvent {
  type: "subagent_status";
  agentId: string;
  status: string;
}

/** Event emitted when a sub-agent starts processing queued input. */
export interface AgentrailSubagentJobStartedEvent {
  type: "subagent_job_started";
  agentId: string;
  jobId: string;
  inputIds: string[];
}

/** Event emitted when a sub-agent job completes successfully. */
export interface AgentrailSubagentJobCompletedEvent {
  type: "subagent_job_completed";
  agentId: string;
  job: Record<string, unknown>;
}

/** Event emitted when a sub-agent job fails. */
export interface AgentrailSubagentJobFailedEvent {
  type: "subagent_job_failed";
  agentId: string;
  job: Record<string, unknown>;
}

/** Event emitted when input is queued for a sub-agent. */
export interface AgentrailSubagentMessageEvent {
  type: "subagent_message";
  agentId: string;
  input: unknown;
}

/** Event emitted when a wait condition is registered. */
export interface AgentrailWaitRegisteredEvent {
  type: "wait_registered";
  wait: unknown;
}

/** Event emitted when a wait condition resolves. */
export interface AgentrailWaitResolvedEvent {
  type: "wait_resolved";
  waitId: string;
  resolution: unknown;
}

/** Event emitted when a sub-agent is closed. */
export interface AgentrailSubagentClosedEvent {
  type: "subagent_closed";
  agentId: string;
  reason?: string;
  finalStatus?: string;
}

/** Host-specific event union layered on top of runtime and skill events. */
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

/** Full event union that may appear in Agentrail host streams. */
export type AgentrailEvent = RuntimeEvent | ExtendedSseEvent | AgentrailHostEvent;

// ─── Unified Workflow Trace ───────────────────────────────────────────────────

/**
 * The set of event types that are persisted to the trace log.
 * High-frequency text/token stream events (message_start/end/update, session_id)
 * are intentionally excluded to avoid noise and log bloat.
 */
export const TRACE_PERSISTED_EVENT_TYPES = new Set([
  // Runtime / skill events
  "agent_start",
  "agent_end",
  "turn_start",
  "turn_end",
  "tool_execution_start",
  "tool_execution_end",
  "skill_start",
  "skill_end",
  "waiting_for_user_input",
  "context_compaction_start",
  "context_compaction_end",
  "error",
  // Orchestration-mapped events
  "orchestration_run_start",
  "orchestration_run_complete",
  "subagent_spawned",
  "subagent_status",
  "subagent_job_started",
  "subagent_job_completed",
  "subagent_job_failed",
  "subagent_message",
  "wait_registered",
  "wait_resolved",
  "subagent_closed",
]);

/** Envelope written to persistent trace logs for replay and visualization. */
export interface WorkflowTraceEventEnvelope {
  id: string;
  timestamp: string;
  sequence: number;
  source: "runtime" | "orchestration";
  event: Record<string, unknown>;
}

let _wrapSeq = 0;

/** Wraps a runtime or orchestration event in a trace envelope. */
export function wrapTraceEvent(
  source: "runtime" | "orchestration",
  event: Record<string, unknown>,
  sequence?: number,
): WorkflowTraceEventEnvelope {
  return {
    id: `${source}-${Date.now()}-${_wrapSeq++}`,
    timestamp: new Date().toISOString(),
    sequence: sequence ?? _wrapSeq,
    source,
    event,
  };
}

/** Maps low-level orchestration events into host stream events. */
export function mapOrchestrationEvent(event: OrchestrationEvent): AgentrailHostEvent | null {
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
