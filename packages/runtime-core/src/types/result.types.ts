/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Message, AssistantMessage, StopReason, ToolResultMessage } from "./message.types.js";
import type { ToolResult } from "./tool.types.js";
import type { ToolCall } from "./content.types.js";
import type { Usage } from "./usage.types.js";

// ============================================================================
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
// ============================================================================

/** Higher-level runtime events exposed by `agent.stream()`. */
export type RuntimeEvent =
  | { readonly type: "agent_start" }
  | { readonly type: "agent_end"; readonly messages: Message[]; readonly usage: Usage }
  | { readonly type: "turn_start" }
  | {
      readonly type: "turn_end";
      readonly message: AssistantMessage;
      readonly toolResults: ToolResultMessage[];
    }
  | { readonly type: "message_start"; readonly message: Message }
  | {
      readonly type: "message_update";
      readonly message: AssistantMessage;
      readonly event: LlmStreamEvent;
    }
  | { readonly type: "message_end"; readonly message: Message }
  | {
      readonly type: "tool_execution_start";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly args: unknown;
    }
  | {
      readonly type: "tool_execution_update";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly partialResult: ToolResult;
    }
  | {
      readonly type: "tool_execution_end";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly result: ToolResult;
      readonly isError: boolean;
    }
  | { readonly type: "max_turns_reached"; readonly turnCount: number }
  | {
      readonly type: "waiting_for_user_input";
      readonly toolCallId: string;
      readonly question: string;
      readonly hint?: string;
      readonly options?: string[];
      readonly multiple?: boolean;
      readonly custom?: boolean;
    }
  | { readonly type: "error"; readonly error: Error };

// ============================================================================
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
): event is Extract<RuntimeEvent, { type: "agent_end" }> {
  return event.type === "agent_end";
}

/** Type guard for runtime-level error events. */
export function isRuntimeError(
  event: RuntimeEvent,
): event is Extract<RuntimeEvent, { type: "error" }> {
  return event.type === "error";
}
