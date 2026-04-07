/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// ============================================================================
// Agent — runtime execution unit
// ============================================================================

export { defineAgent } from "./agent/define-agent.js";
export type { AgentConfig, ModelConfig } from "./agent/define-agent.js";
export type { Agent } from "./interfaces/agent.js";

// ============================================================================
// Tools
// ============================================================================

/** Object-style tool definition — the recommended API. */
export { defineTool } from "./tools/define-tool.js";
/** Fluent tool builder — available for advanced use cases. */
export { defineSimpleTool, tool } from "./tools/tool-builder.js";
export type { ToolBuilder, ToolExecutionContext } from "./tools/tool-builder.js";

export { Type } from "@sinclair/typebox";
export type { Static, TSchema } from "@sinclair/typebox";

export type {
  ExtractToolDetails,
  ExtractToolParams,
  RuntimeTool,
  ToolDefinition,
  ToolResult,
  ToolSignalEvent,
  ToolUpdateCallback,
} from "./types/tool.types.js";

// ============================================================================
// Session contracts — shared interfaces used by app and capabilities layers
// ============================================================================

export type { AgentrailSessionStore, ContextProvider, ContextProviderContext } from "./session/contracts.js";
export type { SessionRef, SessionRefInfo } from "./session/session-ref.js";
export { createSessionRef, resolveSessionRef } from "./session/session-ref.js";
export type { TodoStorage } from "./session/todo-storage.js";
export type {
  CompactionMetadata,
  MemoryIndex,
  MemoryIndexEntry,
  SessionContextUsage,
  SessionEvent,
  SessionEventType,
  SessionHandle,
  SessionInfo,
  SessionInitEvent,
  SessionMeta,
  SessionTurnEvent,
  SessionUpdateEvent,
} from "./session/types.js";

// ============================================================================
// Prompt utilities
// ============================================================================

export {
  createPromptBuilder,
  definePromptBundle,
  definePromptFragment,
  loadPromptFile,
  PromptLoader,
  renderPrompt,
  stripPromptMetadata,
} from "./prompts/index.js";
export type {
  PromptBundle,
  PromptBuilder,
  PromptFragment,
  PromptLayer,
  PromptLayerName,
  PromptRenderOptions,
  PromptValue,
  PromptVars,
} from "./prompts/index.js";

// ============================================================================
// Agent invocation types
// ============================================================================

export type {
  AgentInput,
  AgentResult,
  AgentRunOptions,
  AgentStream,
  GetSteeringMessagesFn,
  TransformContextFn,
} from "./types/agent.types.js";
export {
  createEmptyAssistantMessage,
  extractText,
  extractToolCalls,
} from "./types/agent.types.js";

export type {
  AssistantContent,
  ImageContent,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultContent,
  UserContent,
} from "./types/content.types.js";

export type { Cost, Usage } from "./types/usage.types.js";

export type {
  ApiType,
  AssistantMessage,
  Message,
  Provider,
  StopReason,
  ToolResultMessage,
  UserMessage,
} from "./types/message.types.js";
export {
  isAssistantMessage,
  isToolResultMessage,
  isUserMessage,
} from "./types/message.types.js";

export type { LlmStreamEvent, RuntimeEvent } from "./types/result.types.js";
export {
  isAgentEnd,
  isLlmStreamDone,
  isLlmStreamError,
  isLlmStreamTerminal,
  isRuntimeError,
} from "./types/result.types.js";

// ============================================================================
// LLM client — low-level provider access
// ============================================================================

export type { LlmClient, LlmProvider, LlmRequest, LlmStream } from "./interfaces/llm-client.js";
export { DefaultLlmClient } from "./llm/default-llm-client.js";
export { LlmProviderRegistry } from "./llm/llm-provider-registry.js";

// ============================================================================
// Errors
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
