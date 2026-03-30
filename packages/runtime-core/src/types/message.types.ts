/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */


import type {
	AssistantContent,
	TextContent,
	ImageContent,
	ToolResultContent,
} from "./content.types.js";
import type { Usage } from "./usage.types.js";

export type StopReason =
	| "stop" // Completed normally
	| "length" // Reached the maxTokens limit
	| "toolUse" // The model requested a tool call and the loop should continue
	| "error" // The model invocation failed
	| "aborted"; // Aborted by the user or runtime

export type Provider = string;

export type ApiType = string;

export interface UserMessage {
	readonly role: "user";
	readonly content: string | (TextContent | ImageContent)[];
	readonly timestamp: number;
}

export interface AssistantMessage {
	readonly role: "assistant";
	readonly content: AssistantContent[];
	readonly provider: Provider;
	readonly modelId: string;
	readonly usage: Usage;
	readonly stopReason: StopReason;
	readonly errorMessage?: string;
	readonly timestamp: number;
}

export interface ToolResultMessage<TDetails = unknown> {
	readonly role: "toolResult";
	readonly toolCallId: string;
	readonly toolName: string;
	readonly content: ToolResultContent[];
	readonly details?: TDetails;
	readonly isError: boolean;
	readonly timestamp: number;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export function isUserMessage(message: Message): message is UserMessage {
	return message.role === "user";
}

export function isAssistantMessage(message: Message): message is AssistantMessage {
	return message.role === "assistant";
}

export function isToolResultMessage(message: Message): message is ToolResultMessage {
	return message.role === "toolResult";
}
