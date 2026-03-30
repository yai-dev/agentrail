/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/**
 * Mock LLM Client for testing
 */

import type { LlmClient, LlmRequest, LlmStream } from "../../src/interfaces/llm-client.js";
import type { AssistantMessage, LlmStreamEvent } from "../../src/types/index.js";
import { EventStream } from "../../src/llm/event-stream.js";

/**
 * Mock LLM Client
 *
 * Provides a controllable LLM client for testing purposes.
 */
export class MockLlmClient implements LlmClient {
	private responses: AssistantMessage[] = [];
	private currentResponseIndex = 0;

	/**
	 * Set the response(s) to return
	 */
	setResponse(message: AssistantMessage | AssistantMessage[]): void {
		this.responses = Array.isArray(message) ? message : [message];
		this.currentResponseIndex = 0;
	}

	/**
	 * Create a mock response
	 */
	static createMockResponse(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
		return {
			role: "assistant",
			content: [{ type: "text", text: "Mock response" }],
			provider: "mock",
			modelId: "mock-model",
			usage: {
				inputTokens: 10,
				outputTokens: 20,
				cacheReadTokens: 0,
				cacheWriteTokens: 0,
				totalTokens: 30,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
			...overrides,
		};
	}

	stream(_request: LlmRequest): LlmStream {
		const stream = new EventStream<LlmStreamEvent, AssistantMessage>(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.message;
				throw new Error("Unexpected event type");
			},
		);

		(async () => {
			const response =
				this.responses[this.currentResponseIndex] ||
				MockLlmClient.createMockResponse();

			this.currentResponseIndex++;

			// Simulate streaming
			stream.push({ type: "start", partial: { ...response, content: [] } });

			for (const block of response.content) {
				if (block.type === "text") {
					stream.push({
						type: "text_start",
						contentIndex: 0,
						partial: response,
					});
					stream.push({
						type: "text_delta",
						contentIndex: 0,
						delta: block.text,
						partial: response,
					});
					stream.push({
						type: "text_end",
						contentIndex: 0,
						content: block.text,
						partial: response,
					});
				}
			}

			stream.push({ type: "done", reason: response.stopReason as any, message: response });
			stream.end();
		})();

		return stream;
	}
}
