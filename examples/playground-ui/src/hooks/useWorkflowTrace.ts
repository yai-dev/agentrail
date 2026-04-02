/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StreamEvent } from "../api.js";
import { fetchSessionTrace } from "../api.js";
import type {
  AgentRunTrace,
  LlmTurnStep,
  ToolCallStep,
  TraceStep,
  WorkflowTraceEventEnvelope,
} from "../types/trace.js";

export interface UseWorkflowTraceResult {
  /** Projected AgentRunTrace[] for TraceDAGView (same shape as useAgentTrace) */
  traces: AgentRunTrace[];
  /** Raw envelopes for filter/detail use */
  envelopes: WorkflowTraceEventEnvelope[];
  /** Whether the initial server fetch is in progress */
  isLoading: boolean;
  /** Feed a live SSE event into state (call from the for-await loop in App.tsx) */
  feedEvent: (event: StreamEvent) => void;
  /** Clear all trace data immediately (call on session switch / new session) */
  clearTrace: () => void;
}

/**
 * Accumulates workflow trace events into a unified envelope list and projects
 * them to AgentRunTrace[] for TraceDAGView.
 *
 * Mirrors useOrchestrationState:
 * - Takes sessionId as parameter
 * - useEffect auto-fetches persisted trace when sessionId changes
 * - feedEvent() appends live SSE events
 * - clearTrace() resets immediately for visual feedback on session switch
 */
export function useWorkflowTrace(sessionId: string | null): UseWorkflowTraceResult {
  const [envelopes, setEnvelopes] = useState<WorkflowTraceEventEnvelope[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  // Load persisted trace when sessionId changes (mirrors useOrchestrationState)
  useEffect(() => {
    if (!sessionId) {
      setEnvelopes([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    fetchSessionTrace(sessionId, abortControllerRef.current.signal)
      .then((fetched) => {
        setEnvelopes((prev) => {
          // No server data — keep all live events accumulated so far.
          if (fetched.length === 0) return prev;

          // Merge: preserve any live runtime events that the server hasn't
          // persisted yet (e.g. agent_start arrives before session_id resolves,
          // DeepResearch path never writes to the persisted session trace store,
          // so runtime events only exist client-side). Orchestration envelopes
          // from the server already cover the orchestration side.
          const fetchedIds = new Set(fetched.map((e) => e.id));
          const liveOnly = prev.filter((e) => e.source === "runtime" && !fetchedIds.has(e.id));

          if (liveOnly.length === 0) {
            seqRef.current = fetched.length;
            return fetched;
          }

          const merged = [...fetched, ...liveOnly].sort((a, b) => {
            const t = a.timestamp.localeCompare(b.timestamp);
            return t !== 0 ? t : a.sequence - b.sequence;
          });
          seqRef.current = merged.length;
          return merged;
        });
      })
      .catch(() => {
        // Keep existing envelopes on fetch error
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [sessionId]);

  /** Feed a live SSE event. Only events whose type is in the persisted set are kept. */
  const feedEvent = useCallback((event: StreamEvent) => {
    const type = event.type;
    if (!TRACE_EVENT_TYPES.has(type)) return;

    const envelope: WorkflowTraceEventEnvelope = {
      id: `runtime-${Date.now()}-${seqRef.current}`,
      timestamp: new Date().toISOString(),
      sequence: seqRef.current++,
      source: "runtime",
      event: event as unknown as Record<string, unknown>,
    };

    setEnvelopes((prev) => [...prev, envelope]);
  }, []);

  /** Reset immediately — mirrors clearOrchestrationState */
  const clearTrace = useCallback(() => {
    setEnvelopes([]);
    setIsLoading(false);
    seqRef.current = 0;
  }, []);

  /** Project envelopes to AgentRunTrace[] using the same logic as useAgentTrace */
  const traces = useMemo(() => projectEnvelopesToTraces(envelopes), [envelopes]);

  return { traces, envelopes, isLoading, feedEvent, clearTrace };
}

// ─── Projection ───────────────────────────────────────────────────────────────

/**
 * The set of event types stored in the trace log.
 * Mirrors TRACE_PERSISTED_EVENT_TYPES from @agentrail/events (defined locally
 * since playground-ui doesn't depend on that package).
 */
const TRACE_EVENT_TYPES = new Set([
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

/**
 * Converts a flat list of WorkflowTraceEventEnvelope into AgentRunTrace[].
 * Logic is equivalent to useAgentTrace.feedEvent applied in sequence.
 */
function projectEnvelopesToTraces(envelopes: WorkflowTraceEventEnvelope[]): AgentRunTrace[] {
  const traces: AgentRunTrace[] = [];
  let currentTrace: AgentRunTrace | null = null;
  const activeLlmId: { main?: string; skill?: string } = {};
  let activeSkill: string | null = null;
  let turnIndex = 0;

  const appendStep = (step: TraceStep) => {
    if (!currentTrace) return;
    currentTrace.steps.push(step);
  };

  const patchStep = (stepId: string, updater: (s: TraceStep) => TraceStep) => {
    if (!currentTrace) return;
    currentTrace.steps = currentTrace.steps.map((s) => (s.id === stepId ? updater(s) : s));
  };

  for (const envelope of envelopes) {
    if (envelope.source !== "runtime") continue;

    const event = envelope.event as Record<string, unknown>;
    const type = event.type as string;
    // Use envelope timestamp as a proxy for arrival time (ms since epoch)
    const now = new Date(envelope.timestamp).getTime();

    if (type === "agent_start") {
      currentTrace = {
        id: envelope.id,
        startTime: now,
        status: "running",
        steps: [],
      };
      activeLlmId.main = undefined;
      activeLlmId.skill = undefined;
      activeSkill = null;
      turnIndex = 0;
      traces.push(currentTrace);
    } else if (type === "skill_start") {
      activeSkill = (event.skillName as string | undefined) ?? null;
    } else if (type === "skill_end") {
      activeSkill = null;
    } else if (type === "turn_start") {
      const source: "main" | "skill" = activeSkill ? "skill" : "main";
      const id = envelope.id + "-llm";
      activeLlmId[source] = id;
      const step: LlmTurnStep = {
        kind: "llm",
        id,
        index: turnIndex++,
        startTime: now,
        status: "running",
        source,
        skillName: activeSkill ?? undefined,
      };
      appendStep(step);
    } else if (type === "turn_end") {
      const source: "main" | "skill" = activeSkill ? "skill" : "main";
      const id = activeLlmId[source];
      if (id) {
        activeLlmId[source] = undefined;
        const stopReason = (event.message as { stopReason?: string } | undefined)?.stopReason;
        patchStep(id, (s) => ({
          ...s,
          endTime: now,
          stopReason,
          status: stopReason === "error" ? "error" : "done",
        }));
      }
    } else if (type === "tool_execution_start") {
      const source: "main" | "skill" = activeSkill ? "skill" : "main";
      const step: ToolCallStep = {
        kind: "tool",
        id: (event.toolCallId as string) ?? envelope.id,
        toolName: (event.toolName as string) ?? "",
        args: event.args,
        startTime: now,
        status: "running",
        source,
        skillName: activeSkill ?? undefined,
        parentLlmId: activeLlmId[source],
      };
      appendStep(step);
    } else if (type === "tool_execution_end") {
      const toolCallId = (event.toolCallId as string) ?? envelope.id;
      patchStep(toolCallId, (s) => ({
        ...s,
        endTime: now,
        result: event.result,
        isError: !!event.isError,
        status: event.isError ? "error" : "done",
      }));
    } else if (type === "agent_end") {
      if (currentTrace) {
        const usage = event.usage as { inputTokens: number; outputTokens: number } | undefined;
        currentTrace.endTime = now;
        currentTrace.status = "done";
        if (usage) currentTrace.usage = usage;
      }
    } else if (type === "error") {
      if (currentTrace) {
        currentTrace.status = "error";
      }
    }
  }

  return traces;
}
