/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useState, useRef, useCallback } from "react";
import type { StreamEvent } from "../api";
import type { AgentRunTrace, LlmTurnStep, ToolCallStep, TraceStep } from "../types/trace";

/**
 * Accumulates SSE events into a list of AgentRunTrace objects.
 *
 * - One AgentRunTrace is created per agent run (one user message).
 * - All timing is recorded using Date.now() at the moment each event arrives.
 * - Skill sub-agent steps are stored in the same flat steps array, distinguished
 *   by `source: "skill"` and `skillName`.
 * - Call clearTraces() when the session changes.
 */
export function useAgentTrace() {
  const [traces, setTraces] = useState<AgentRunTrace[]>([]);

  // Ref to the trace currently being built — stable across re-renders.
  const currentTraceIdRef = useRef<string | null>(null);

  // Tracks the most-recently-opened LLM turn id per scope (main / skill).
  const activeLlmIdRef = useRef<{ main?: string; skill?: string }>({});

  // Current active skill name (set by skill_start, cleared by skill_end).
  const activeSkillRef = useRef<string | null>(null);

  // Running counter for LLM turn index labels.
  const turnIndexRef = useRef(0);

  // ─── helpers ────────────────────────────────────────────────────────────────

  const appendStep = useCallback((step: TraceStep) => {
    const traceId = currentTraceIdRef.current;
    if (!traceId) return;
    setTraces((prev) =>
      prev.map((t) =>
        t.id === traceId ? { ...t, steps: [...t.steps, step] } : t,
      ),
    );
  }, []);

  const patchStep = useCallback(
    (stepId: string, updater: (s: TraceStep) => TraceStep) => {
      const traceId = currentTraceIdRef.current;
      if (!traceId) return;
      setTraces((prev) =>
        prev.map((t) =>
          t.id === traceId
            ? { ...t, steps: t.steps.map((s) => (s.id === stepId ? updater(s) : s)) }
            : t,
        ),
      );
    },
    [],
  );

  // ─── public API ─────────────────────────────────────────────────────────────

  const feedEvent = useCallback(
    (event: StreamEvent) => {
      const now = Date.now();

      if (event.type === "agent_start") {
        const id = crypto.randomUUID();
        currentTraceIdRef.current = id;
        activeLlmIdRef.current = {};
        activeSkillRef.current = null;
        turnIndexRef.current = 0;

        const trace: AgentRunTrace = {
          id,
          startTime: now,
          status: "running",
          steps: [],
        };
        setTraces((prev) => [...prev, trace]);

      } else if (event.type === "skill_start") {
        const se = event as { type: "skill_start"; skillName: string };
        activeSkillRef.current = se.skillName;

      } else if (event.type === "skill_end") {
        activeSkillRef.current = null;

      } else if (event.type === "turn_start") {
        const source: "main" | "skill" = activeSkillRef.current ? "skill" : "main";
        const id = crypto.randomUUID();
        activeLlmIdRef.current[source] = id;

        const step: LlmTurnStep = {
          kind: "llm",
          id,
          index: turnIndexRef.current++,
          startTime: now,
          status: "running",
          source,
          skillName: activeSkillRef.current ?? undefined,
        };
        appendStep(step);

      } else if (event.type === "turn_end") {
        const te = event as { type: "turn_end"; message: { stopReason: string } };
        const source: "main" | "skill" = activeSkillRef.current ? "skill" : "main";
        const id = activeLlmIdRef.current[source];
        if (!id) return;
        activeLlmIdRef.current[source] = undefined;

        patchStep(id, (s) => ({
          ...s,
          endTime: now,
          stopReason: te.message?.stopReason,
          status: te.message?.stopReason === "error" ? "error" : "done",
        }));

      } else if (event.type === "tool_execution_start") {
        const tes = event as {
          type: "tool_execution_start";
          toolCallId: string;
          toolName: string;
          args: unknown;
        };
        const source: "main" | "skill" = activeSkillRef.current ? "skill" : "main";
        const parentLlmId = activeLlmIdRef.current[source];

        const step: ToolCallStep = {
          kind: "tool",
          id: tes.toolCallId,
          toolName: tes.toolName,
          args: tes.args,
          startTime: now,
          status: "running",
          source,
          skillName: activeSkillRef.current ?? undefined,
          parentLlmId,
        };
        appendStep(step);

      } else if (event.type === "tool_execution_end") {
        const tee = event as {
          type: "tool_execution_end";
          toolCallId: string;
          result: unknown;
          isError: boolean;
        };
        patchStep(tee.toolCallId, (s) => ({
          ...s,
          endTime: now,
          result: tee.result,
          isError: tee.isError,
          status: tee.isError ? "error" : "done",
        }));

      } else if (event.type === "agent_end") {
        const ae = event as { type: "agent_end"; usage: { inputTokens: number; outputTokens: number } };
        const traceId = currentTraceIdRef.current;
        if (!traceId) return;
        setTraces((prev) =>
          prev.map((t) =>
            t.id === traceId
              ? { ...t, endTime: now, status: "done", usage: ae.usage }
              : t,
          ),
        );

      } else if (event.type === "error") {
        const traceId = currentTraceIdRef.current;
        if (!traceId) return;
        setTraces((prev) =>
          prev.map((t) => (t.id === traceId ? { ...t, status: "error" as const } : t)),
        );
      }
    },
    [appendStep, patchStep],
  );

  /** Clear all traces (call when session changes). */
  const clearTraces = useCallback(() => {
    setTraces([]);
    currentTraceIdRef.current = null;
    activeLlmIdRef.current = {};
    activeSkillRef.current = null;
    turnIndexRef.current = 0;
  }, []);

  return { traces, feedEvent, clearTraces };
}
