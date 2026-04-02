/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  AssistantContent,
  ImageContent,
  TextContent,
  ToolResultContent,
} from "./content.types.js";
import type { Usage } from "./usage.types.js";

/** Terminal reason reported by a model invocation or agent loop. */
export type StopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

/** Provider identifier attached to assistant messages. */
export type Provider = string;

/** Provider-specific API flavor when a backend exposes multiple protocols. */
export type ApiType = string;

/** End-user input message supplied to the runtime. */
export interface UserMessage {
  /** Discriminator for user messages. */
  readonly role: "user";
  /** Plain text or multimodal content blocks supplied by the caller. */
  readonly content: string | (TextContent | ImageContent)[];
  /** Unix timestamp in milliseconds when the message was created. */
  readonly timestamp: number;
}

/** Assistant response message emitted by the runtime. */
export interface AssistantMessage {
  /** Discriminator for assistant messages. */
  readonly role: "assistant";
  /** Structured content blocks returned by the provider. */
  readonly content: AssistantContent[];
  /** Provider that generated the message. */
  readonly provider: Provider;
  /** Provider-specific model identifier used for the turn. */
  readonly modelId: string;
  /** Token and cost usage attributed to this message. */
  readonly usage: Usage;
  /** Terminal reason reported when this assistant turn ended. */
  readonly stopReason: StopReason;
  /** Optional human-readable error summary for failed turns. */
  readonly errorMessage?: string;
  /** Unix timestamp in milliseconds when the message was created. */
  readonly timestamp: number;
}

/** Tool result message fed back into the model after a tool call completes. */
export interface ToolResultMessage<TDetails = unknown> {
  /** Discriminator for tool result messages. */
  readonly role: "toolResult";
  /** ID of the originating tool call. */
  readonly toolCallId: string;
  /** Tool name copied from the originating tool call. */
  readonly toolName: string;
  /** Model-visible result blocks returned by the tool. */
  readonly content: ToolResultContent[];
  /** Optional machine-friendly details preserved for host code. */
  readonly details?: TDetails;
  /** Indicates that the tool execution failed. */
  readonly isError: boolean;
  /** Unix timestamp in milliseconds when the result was created. */
  readonly timestamp: number;
}

/** Union of all message roles understood by the runtime. */
export type Message = UserMessage | AssistantMessage | ToolResultMessage;

/** Type guard for narrowing a message to `UserMessage`. */
export function isUserMessage(message: Message): message is UserMessage {
  return message.role === "user";
}

/** Type guard for narrowing a message to `AssistantMessage`. */
export function isAssistantMessage(message: Message): message is AssistantMessage {
  return message.role === "assistant";
}

/** Type guard for narrowing a message to `ToolResultMessage`. */
export function isToolResultMessage(message: Message): message is ToolResultMessage {
  return message.role === "toolResult";
}
