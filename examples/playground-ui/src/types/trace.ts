/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/** An LLM invocation turn within an agent run. */
export interface LlmTurnStep {
  kind: "llm";
  id: string;
  index: number;
  startTime: number;
  endTime?: number;
  status: "running" | "done" | "error";
  stopReason?: string;
  source: "main" | "skill";
  skillName?: string;
}

/** A single tool call within an agent run. */
export interface ToolCallStep {
  kind: "tool";
  id: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  startTime: number;
  endTime?: number;
  status: "running" | "done" | "error";
  source: "main" | "skill";
  skillName?: string;
  /** The LLM turn that issued this tool call. */
  parentLlmId?: string;
}

export type TraceStep = LlmTurnStep | ToolCallStep;

/** The complete trace for one agent run (one user message → one agent response). */
export interface AgentRunTrace {
  id: string;
  startTime: number;
  endTime?: number;
  status: "running" | "done" | "error";
  /** All steps in arrival order (both main and skill sub-agent steps). */
  steps: TraceStep[];
  usage?: { inputTokens: number; outputTokens: number };
}
