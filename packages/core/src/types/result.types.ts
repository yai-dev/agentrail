/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { ToolCall } from "@/types/content.types.js";
import type { AssistantMessage, Message, StopReason, ToolResultMessage } from "@/types/message.types.js";
import type { ToolResult } from "@/types/tool.types.js";
import type { Usage } from "@/types/usage.types.js";

// ============================================================================
// LlmStreamEvent
// ============================================================================

/** Fine-grained provider stream events emitted while assembling an assistant message. */
export type LlmStreamEvent =
  | { readonly type: "start"; readonly partial: AssistantMessage }
  | {
      readonly type: "text_start";
      readonly contentIndex: number;
      readonly partial: AssistantMessage;
    }
  | {
      readonly type: "text_delta";
      readonly contentIndex: number;
      readonly delta: string;
      readonly partial: AssistantMessage;
    }
  | {
      readonly type: "text_end";
      readonly contentIndex: number;
      readonly content: string;
      readonly partial: AssistantMessage;
    }
  | {
      readonly type: "thinking_start";
      readonly contentIndex: number;
      readonly partial: AssistantMessage;
    }
  | {
      readonly type: "thinking_delta";
      readonly contentIndex: number;
      readonly delta: string;
      readonly partial: AssistantMessage;
    }
  | {
      readonly type: "thinking_end";
      readonly contentIndex: number;
      readonly content: string;
      readonly partial: AssistantMessage;
    }
  | {
      readonly type: "toolcall_start";
      readonly contentIndex: number;
      readonly partial: AssistantMessage;
    }
  | {
      readonly type: "toolcall_delta";
      readonly contentIndex: number;
      readonly delta: string;
      readonly partial: AssistantMessage;
    }
  | {
      readonly type: "toolcall_end";
      readonly contentIndex: number;
      readonly toolCall: ToolCall;
      readonly partial: AssistantMessage;
    }
  | {
      readonly type: "done";
      readonly reason: Extract<StopReason, "stop" | "length" | "toolUse">;
      readonly message: AssistantMessage;
    }
  | {
      readonly type: "error";
      readonly reason: Extract<StopReason, "error" | "aborted">;
      readonly message: AssistantMessage;
    };

// ============================================================================
// RuntimeEvent
// ============================================================================

/**
 * Higher-level runtime events exposed by `agent.stream()`.
 *
 * Event types use a dotted namespace convention:
 *   - `session.*`  — overall agent session lifecycle
 *   - `turn.*`     — individual reasoning/tool turn within a session
 *   - `message.*`  — individual message lifecycle (including tool results)
 *   - `tool.*`     — tool execution lifecycle
 *
 * @see {@link https://agentrail.run/concepts/events}
 */
export type RuntimeEvent =
  // ── Session lifecycle ────────────────────────────────────────────────────
  /** Emitted once when the agent begins processing the user input. */
  | { readonly type: "session.start" }
  /** Emitted once after all turns complete. Contains the full message list and token usage. */
  | { readonly type: "session.end"; readonly messages: Message[]; readonly usage: Usage }
  // ── Turn lifecycle ───────────────────────────────────────────────────────
  /** Emitted at the start of each reasoning turn (LLM call). */
  | { readonly type: "turn.start" }
  /** Emitted after each turn completes, including the assistant message and any tool results. */
  | {
      readonly type: "turn.complete";
      readonly message: AssistantMessage;
      readonly toolResults: ToolResultMessage[];
    }
  // ── Message lifecycle ────────────────────────────────────────────────────
  /** Emitted when a new message (user, assistant, or tool result) begins. */
  | { readonly type: "message.start"; readonly message: Message }
  /** Emitted for each incremental token update on an in-progress assistant message. */
  | {
      readonly type: "message.update";
      readonly message: AssistantMessage;
      readonly event: LlmStreamEvent;
    }
  /** Emitted once a message is fully assembled. */
  | { readonly type: "message.end"; readonly message: Message }
  // ── Tool execution ───────────────────────────────────────────────────────
  /** Emitted just before a tool call is dispatched to the tool implementation. */
  | {
      readonly type: "tool.before";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly args: unknown;
    }
  /** Emitted for each incremental update produced by a streaming tool. */
  | {
      readonly type: "tool.update";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly partialResult: ToolResult;
    }
  /** Emitted once a tool call completes (success or error). `isError` distinguishes the two. */
  | {
      readonly type: "tool.after";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly result: ToolResult;
      readonly isError: boolean;
    }
  // ── Control flow ─────────────────────────────────────────────────────────
  /** Emitted when the configured `maxTurns` limit is reached. */
  | { readonly type: "max_turns_reached"; readonly turnCount: number }
  /**
   * Emitted when a tool requests human input. The host is expected to collect
   * the response and resume execution.
   */
  | {
      readonly type: "waiting_for_user_input";
      readonly toolCallId: string;
      readonly question: string;
      readonly hint?: string;
      readonly options?: string[];
      readonly multiple?: boolean;
      readonly custom?: boolean;
    }
  // ── New lifecycle events ─────────────────────────────────────────────────
  /** Emitted when context compaction runs during a streaming request. */
  | { readonly type: "compaction"; readonly messagesBefore: number; readonly messagesAfter: number }
  /** Emitted when a sub-agent is spawned by a capability (e.g. a skill). */
  | { readonly type: "subagent.spawn"; readonly childSessionId: string }
  /** Emitted when a spawned sub-agent finishes. */
  | { readonly type: "subagent.complete"; readonly childSessionId: string }
  // ── Error ────────────────────────────────────────────────────────────────
  /** Emitted when a runtime error terminates the agent stream. */
  | { readonly type: "error"; readonly error: Error };

// ============================================================================
// Deprecated aliases (remove in next major)
// ============================================================================

/** @deprecated Use `session.start` — will be removed in the next major version. */
export type AgentStartEvent = Extract<RuntimeEvent, { type: "session.start" }>;
/** @deprecated Use `session.end` — will be removed in the next major version. */
export type AgentEndEvent = Extract<RuntimeEvent, { type: "session.end" }>;
/** @deprecated Use `turn.start` — will be removed in the next major version. */
export type TurnStartEvent = Extract<RuntimeEvent, { type: "turn.start" }>;
/** @deprecated Use `turn.complete` — will be removed in the next major version. */
export type TurnEndEvent = Extract<RuntimeEvent, { type: "turn.complete" }>;
/** @deprecated Use `message.start` — will be removed in the next major version. */
export type MessageStartEvent = Extract<RuntimeEvent, { type: "message.start" }>;
/** @deprecated Use `message.update` — will be removed in the next major version. */
export type MessageUpdateEvent = Extract<RuntimeEvent, { type: "message.update" }>;
/** @deprecated Use `message.end` — will be removed in the next major version. */
export type MessageEndEvent = Extract<RuntimeEvent, { type: "message.end" }>;
/** @deprecated Use `tool.before` — will be removed in the next major version. */
export type ToolExecutionStartEvent = Extract<RuntimeEvent, { type: "tool.before" }>;
/** @deprecated Use `tool.update` — will be removed in the next major version. */
export type ToolExecutionUpdateEvent = Extract<RuntimeEvent, { type: "tool.update" }>;
/** @deprecated Use `tool.after` — will be removed in the next major version. */
export type ToolExecutionEndEvent = Extract<RuntimeEvent, { type: "tool.after" }>;

// ============================================================================
// Type guards
// ============================================================================

/** Type guard for terminal success events in an LLM stream. */
export function isLlmStreamDone(
  event: LlmStreamEvent,
): event is Extract<LlmStreamEvent, { type: "done" }> {
  return event.type === "done";
}

/** Type guard for terminal failure events in an LLM stream. */
export function isLlmStreamError(
  event: LlmStreamEvent,
): event is Extract<LlmStreamEvent, { type: "error" }> {
  return event.type === "error";
}

/** Returns `true` when an LLM stream has reached a terminal event. */
export function isLlmStreamTerminal(event: LlmStreamEvent): boolean {
  return event.type === "done" || event.type === "error";
}

/** Type guard for the final aggregate event emitted by `agent.stream()`. */
export function isAgentEnd(
  event: RuntimeEvent,
): event is Extract<RuntimeEvent, { type: "session.end" }> {
  return event.type === "session.end";
}

/** Type guard for runtime-level error events. */
export function isRuntimeError(
  event: RuntimeEvent,
): event is Extract<RuntimeEvent, { type: "error" }> {
  return event.type === "error";
}
