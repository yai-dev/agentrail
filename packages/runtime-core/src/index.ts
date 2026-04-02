/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// ============================================================================
// ============================================================================

export { defineAgent } from "./agent/define-agent.js";
/** Agent declaration types exported by the runtime core. */
export type { AgentConfig, ModelConfig } from "./agent/define-agent.js";
/** Executable agent interface exported by the runtime core. */
export type { Agent } from "./interfaces/agent.js";

export { defineSimpleTool, tool } from "./tools/tool-builder.js";
/** Fluent tool-builder types exported by the runtime core. */
export type { ToolBuilder, ToolExecutionContext } from "./tools/tool-builder.js";
export { Type } from "@sinclair/typebox";
/** Re-exported TypeBox helper types used by Agentrail tool schemas. */
export type { TSchema, Static } from "@sinclair/typebox";

// ============================================================================
// ============================================================================

/** Agent invocation input/output types exported by the runtime core. */
export type {
  AgentInput,
  AgentResult,
  AgentRunOptions,
  AgentStream,
  GetSteeringMessagesFn,
  TransformContextFn,
} from "./types/agent.types.js";

export { createEmptyAssistantMessage, extractText, extractToolCalls } from "./types/agent.types.js";

/** Content block types used across runtime messages and tool results. */
export type {
  AssistantContent,
  ImageContent,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultContent,
  UserContent,
} from "./types/content.types.js";

/** Token and cost accounting types exported by the runtime core. */
export type { Cost, Usage } from "./types/usage.types.js";

/** Message role and message-envelope types exported by the runtime core. */
export type {
  ApiType,
  AssistantMessage,
  Message,
  Provider,
  StopReason,
  ToolResultMessage,
  UserMessage,
} from "./types/message.types.js";

export { isAssistantMessage, isToolResultMessage, isUserMessage } from "./types/message.types.js";

/** Tool contract and type-extraction helpers exported by the runtime core. */
export type {
  ExtractToolDetails,
  ExtractToolParams,
  RuntimeTool,
  ToolDefinition,
  ToolResult,
  ToolSignalEvent,
  ToolUpdateCallback,
} from "./types/tool.types.js";

/** Runtime stream event types exported by the runtime core. */
export type { LlmStreamEvent, RuntimeEvent } from "./types/result.types.js";

export {
  isAgentEnd,
  isLlmStreamDone,
  isLlmStreamError,
  isLlmStreamTerminal,
  isRuntimeError,
} from "./types/result.types.js";

// ============================================================================
// ============================================================================

/** Low-level LLM client interfaces exported by the runtime core. */
export type { LlmClient, LlmProvider, LlmRequest, LlmStream } from "./interfaces/llm-client.js";
export { DefaultLlmClient } from "./llm/default-llm-client.js";
export { LlmProviderRegistry } from "./llm/llm-provider-registry.js";

// ============================================================================
// ============================================================================

export {
  AbortedError,
  LlmError,
  ProviderNotFoundError,
  RuntimeError,
  ToolExecutionError,
  ToolNotFoundError,
  ToolValidationError,
} from "./errors.js";
