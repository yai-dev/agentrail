/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */


export type {
	TextContent,
	ThinkingContent,
	ImageContent,
	ToolCall,
	AssistantContent,
	UserContent,
	ToolResultContent,
} from "./content.types.js";

export type { Cost, Usage } from "./usage.types.js";

export type {
	StopReason,
	Provider,
	ApiType,
	UserMessage,
	AssistantMessage,
	ToolResultMessage,
	Message,
} from "./message.types.js";

export {
	isUserMessage,
	isAssistantMessage,
	isToolResultMessage,
} from "./message.types.js";

export type {
	ToolDefinition,
	ToolResult,
	ToolUpdateCallback,
	RuntimeTool,
	ExtractToolParams,
	ExtractToolDetails,
} from "./tool.types.js";

export type {
	AgentInput,
	AgentRunOptions,
	AgentResult,
	AgentStream,
	TransformContextFn,
	GetSteeringMessagesFn,
} from "./agent.types.js";

export {
	extractText,
	extractToolCalls,
	createEmptyAssistantMessage,
} from "./agent.types.js";

export type { LlmStreamEvent, RuntimeEvent } from "./result.types.js";

export {
	isLlmStreamDone,
	isLlmStreamError,
	isLlmStreamTerminal,
	isAgentEnd,
	isRuntimeError,
} from "./result.types.js";
