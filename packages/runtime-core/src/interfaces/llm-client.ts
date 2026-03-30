/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */


import type { Message, AssistantMessage } from "../types/message.types.js";
import type { ToolDefinition } from "../types/tool.types.js";
import type { ModelConfig } from "../agent/define-agent.js";
import type { LlmStreamEvent } from "../types/result.types.js";

export interface LlmRequest {
	readonly model: ModelConfig;
	readonly systemPrompt?: string;
	readonly messages: Message[];
	readonly tools?: ToolDefinition[];
	readonly temperature?: number;
	readonly maxTokens?: number;
	readonly thinkingEnabled?: boolean;
	readonly signal?: AbortSignal;
}

export interface LlmStream extends AsyncIterable<LlmStreamEvent> {
	result(): Promise<AssistantMessage>;
}

export interface LlmClient {
	stream(request: LlmRequest): LlmStream;
}

export interface LlmProvider {
	readonly provider: string;

	stream(request: LlmRequest): LlmStream;
}
