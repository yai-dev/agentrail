/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */


import type { Agent } from "../interfaces/agent.js";
import type { AgentConfig, ModelConfig } from "./define-agent.js";
import type {
	AgentInput,
	AgentRunOptions,
	AgentResult,
	AgentStream,
	TransformContextFn,
} from "../types/agent.types.js";
import type { Message, UserMessage } from "../types/message.types.js";
import type { UserContent } from "../types/content.types.js";
import type { Usage } from "../types/usage.types.js";
import type { StopReason } from "../types/message.types.js";
import type { RuntimeEvent } from "../types/result.types.js";
import type { RuntimeTool } from "../types/tool.types.js";
import { isAssistantMessage, isUserMessage } from "../types/message.types.js";
import {
	extractText,
	extractToolCalls,
	createEmptyAssistantMessage,
} from "../types/agent.types.js";
import { agentLoop } from "./agent-loop.js";
import { DefaultLlmClient } from "../llm/default-llm-client.js";

// ============================================================================
// ============================================================================

interface InternalSpec {
	id: string;
	name: string;
	systemPrompt: string;
	model: ModelConfig;
	tools?: RuntimeTool[];
	maxTokens?: number;
	temperature?: number;
	thinkingEnabled?: boolean;
	maxTurns?: number;
	maxTurnsMessage?: string;
}

interface InternalContext {
	conversationId: string;
	messages: Message[];
	signal?: AbortSignal;
	transformContext?: TransformContextFn;
	metadata?: Record<string, unknown>;
}

// ============================================================================
// ============================================================================

export class AgentImpl implements Agent {
	readonly id: string;
	readonly name: string;

	private readonly spec: InternalSpec;
	private readonly defaultMaxTokens?: number;
	private readonly defaultTemperature?: number;
	private readonly defaultThinkingEnabled?: boolean;
	private readonly defaultMaxTurns?: number;
	private readonly defaultMaxTurnsMessage?: string;

	constructor(config: AgentConfig) {
		this.id = config.id;
		this.name = config.name ?? config.id;

		this.spec = {
			id: config.id,
			name: this.name,
			systemPrompt: config.system,
			model: this.normalizeModel(config.model),
			tools: this.normalizeTools(config.tools),
			maxTokens: config.maxTokens,
			temperature: config.temperature,
			thinkingEnabled: config.thinkingEnabled,
			maxTurns: config.maxTurns,
			maxTurnsMessage: config.maxTurnsMessage,
		};

		this.defaultMaxTokens = config.maxTokens;
		this.defaultTemperature = config.temperature;
		this.defaultThinkingEnabled = config.thinkingEnabled;
		this.defaultMaxTurns = config.maxTurns;
		this.defaultMaxTurnsMessage = config.maxTurnsMessage;
	}

	invoke(input: AgentInput, options?: AgentRunOptions): Promise<AgentResult> {
		return this.collectResult(this.stream(input, options));
	}

	stream(input: AgentInput, options?: AgentRunOptions): AgentStream {
		const mergedSpec = this.mergeSpec(options);
		const context = this.buildContext(options);
		const userMessage = this.inputToMessage(input);

		const llmClient = new DefaultLlmClient();
		const eventStream = agentLoop([userMessage], context, {
			spec: mergedSpec,
			llmClient,
			transformContext: options?.transformContext,
			getSteeringMessages: options?.getSteeringMessages,
		});

		return this.createAgentStream(eventStream);
	}

	async batch(inputs: AgentInput[], options?: AgentRunOptions): Promise<AgentResult[]> {
		return Promise.all(inputs.map((input) => this.invoke(input, options)));
	}

	// ============================================================================
	// ============================================================================

	private normalizeModel(model: string | ModelConfig): ModelConfig {
		if (typeof model === "string") {
			const [provider, ...modelParts] = model.split(":");
			if (!provider || modelParts.length === 0) {
				throw new Error(
					`Invalid model string: ${model}. Expected format: "provider:modelId"`,
				);
			}
			return {
				provider,
				modelId: modelParts.join(":"),
			};
		}
		return model;
	}

	private normalizeTools(
		tools?: RuntimeTool[] | Record<string, RuntimeTool>,
	): RuntimeTool[] | undefined {
		if (!tools) return undefined;
		if (Array.isArray(tools)) return tools;
		return Object.values(tools);
	}

	private mergeSpec(options?: AgentRunOptions): InternalSpec {
		return {
			...this.spec,
			maxTokens: options?.maxTokens ?? this.defaultMaxTokens,
			temperature: options?.temperature ?? this.defaultTemperature,
			thinkingEnabled: options?.thinkingEnabled ?? this.defaultThinkingEnabled,
			maxTurns: options?.maxTurns ?? this.defaultMaxTurns,
			maxTurnsMessage: options?.maxTurnsMessage ?? this.defaultMaxTurnsMessage,
		};
	}

	private buildContext(options?: AgentRunOptions): InternalContext {
		return {
			conversationId: `conv-${Date.now()}`,
			messages: options?.messages ?? [],
			signal: options?.signal,
			transformContext: options?.transformContext,
		};
	}

	private inputToMessage(input: AgentInput): UserMessage {
		if (typeof input === "string") {
			return {
				role: "user",
				content: input,
				timestamp: Date.now(),
			};
		}

		if (Array.isArray(input) && input.length > 0) {
			const first = input[0];
			if (first && typeof first === "object" && "role" in first) {
				const messages = input as Message[];
				const lastUserMessage = [...messages]
					.reverse()
					.find((m): m is UserMessage => isUserMessage(m));
				if (lastUserMessage) {
					return lastUserMessage;
				}
			}
		}

		return {
			role: "user",
			content: input as UserContent[],
			timestamp: Date.now(),
		};
	}

	private createAgentStream(
		eventStream: AsyncIterable<RuntimeEvent>,
	): AgentStream {
		let resultPromise: Promise<AgentResult> | null = null;
		const iterator = eventStream[Symbol.asyncIterator]();

		const stream: AgentStream = {
			[Symbol.asyncIterator]: () => iterator,
			result: () => {
				if (!resultPromise) {
					resultPromise = this.collectResultFromIterator(stream);
				}
				return resultPromise;
			},
		};

		return stream;
	}

	private async collectResult(
		stream: AgentStream,
	): Promise<AgentResult> {
		return stream.result();
	}

	private async collectResultFromIterator(
		stream: AsyncIterable<RuntimeEvent>,
	): Promise<AgentResult> {
		let messages: Message[] = [];
		let usage: Usage = {
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
		};
		let stopReason: StopReason = "stop";

		for await (const event of stream) {
			if (event.type === "agent_end") {
				messages = event.messages;
				usage = event.usage;
			}
			if (event.type === "error") {
				stopReason = "error";
			}
		}

		const lastAssistantMessage = messages.filter(isAssistantMessage).pop();
		const lastMessage = lastAssistantMessage ?? createEmptyAssistantMessage();

		return {
			messages,
			lastMessage,
			usage,
			stopReason,
			get text() {
				return extractText(lastMessage);
			},
			get toolCalls() {
				return extractToolCalls(lastMessage);
			},
		};
	}
}
