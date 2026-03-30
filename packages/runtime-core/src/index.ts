/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */


// ============================================================================
// ============================================================================

export { defineAgent } from "./agent/define-agent.js";
export type { AgentConfig, ModelConfig } from "./agent/define-agent.js";
export type { Agent } from "./interfaces/agent.js";

export { defineSimpleTool, tool } from "./tools/tool-builder.js";
export type { ToolBuilder, ToolExecutionContext } from "./tools/tool-builder.js";
export { Type } from "@sinclair/typebox";
export type { TSchema, Static } from "@sinclair/typebox";

// ============================================================================
// ============================================================================

export type {
    AgentInput, AgentResult, AgentRunOptions, AgentStream, GetSteeringMessagesFn, TransformContextFn
} from "./types/agent.types.js";

export {
    createEmptyAssistantMessage, extractText,
    extractToolCalls
} from "./types/agent.types.js";

export type {
    AssistantContent, ImageContent, TextContent,
    ThinkingContent, ToolCall, ToolResultContent, UserContent
} from "./types/content.types.js";

export type { Cost, Usage } from "./types/usage.types.js";

export type {
    ApiType, AssistantMessage, Message, Provider, StopReason, ToolResultMessage, UserMessage
} from "./types/message.types.js";

export {
    isAssistantMessage,
    isToolResultMessage, isUserMessage
} from "./types/message.types.js";

export type {
    ExtractToolDetails, ExtractToolParams, RuntimeTool, ToolDefinition,
    ToolResult,
    ToolSignalEvent,
    ToolUpdateCallback
} from "./types/tool.types.js";

export type { LlmStreamEvent, RuntimeEvent } from "./types/result.types.js";

export {
    isAgentEnd, isLlmStreamDone,
    isLlmStreamError,
    isLlmStreamTerminal, isRuntimeError
} from "./types/result.types.js";

// ============================================================================
// ============================================================================

export type { LlmClient, LlmProvider, LlmRequest, LlmStream } from "./interfaces/llm-client.js";
export { DefaultLlmClient } from "./llm/default-llm-client.js";
export { LlmProviderRegistry } from "./llm/llm-provider-registry.js";

// ============================================================================
// ============================================================================

export {
    AbortedError, LlmError, ProviderNotFoundError, RuntimeError, ToolExecutionError, ToolNotFoundError, ToolValidationError
} from "./errors.js";

