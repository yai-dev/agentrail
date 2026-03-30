/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */


import type { Message, AssistantMessage, StopReason } from "./message.types.js";
import type { UserContent, ToolCall } from "./content.types.js";
import type { Usage } from "./usage.types.js";
import type { RuntimeEvent } from "./result.types.js";

// ============================================================================
// ============================================================================

export type AgentInput = string | UserContent[] | Message[];

// ============================================================================
// ============================================================================

export type TransformContextFn = (
	messages: Message[],
	signal?: AbortSignal,
) => Promise<Message[]>;

export type GetSteeringMessagesFn = () => Promise<Message[]>;

export interface AgentRunOptions {
	readonly messages?: Message[];

	readonly maxTokens?: number;

	readonly temperature?: number;

	readonly thinkingEnabled?: boolean;

	readonly signal?: AbortSignal;

	readonly transformContext?: TransformContextFn;

	readonly getSteeringMessages?: GetSteeringMessagesFn;

	readonly maxTurns?: number;

	readonly maxTurnsMessage?: string;
}

// ============================================================================
// ============================================================================

export interface AgentResult {
	readonly messages: Message[];

	readonly lastMessage: AssistantMessage;

	readonly usage: Usage;

	readonly stopReason: StopReason;

	readonly text: string;

	readonly toolCalls: ToolCall[];
}

// ============================================================================
// ============================================================================

export interface AgentStream extends AsyncIterable<RuntimeEvent> {
	result(): Promise<AgentResult>;
}

// ============================================================================
// ============================================================================

export function extractText(message: AssistantMessage): string {
	return message.content
		.filter((block): block is { type: "text"; text: string } => block.type === "text")
		.map((block) => block.text)
		.join("");
}

export function extractToolCalls(message: AssistantMessage): ToolCall[] {
	return message.content.filter((block): block is ToolCall => block.type === "toolCall");
}

export function createEmptyAssistantMessage(): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		provider: "unknown",
		modelId: "unknown",
		usage: {
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			totalTokens: 0,
			cost: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				total: 0,
			},
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}
