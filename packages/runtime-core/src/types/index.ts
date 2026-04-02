/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/** Content block types used across runtime messages and tool results. */
export type {
  AssistantContent,
  ImageContent,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultContent,
  UserContent,
} from "./content.types.js";

/** Token and cost accounting types exported from the runtime core type surface. */
export type { Cost, Usage } from "./usage.types.js";

/** Message role and envelope types exported from the runtime core type surface. */
export type {
  ApiType,
  AssistantMessage,
  Message,
  Provider,
  StopReason,
  ToolResultMessage,
  UserMessage,
} from "./message.types.js";

export { isAssistantMessage, isToolResultMessage, isUserMessage } from "./message.types.js";

/** Tool contract and helper types exported from the runtime core type surface. */
export type {
  ExtractToolDetails,
  ExtractToolParams,
  RuntimeTool,
  ToolDefinition,
  ToolResult,
  ToolUpdateCallback,
} from "./tool.types.js";

/** Agent invocation input/output types exported from the runtime core type surface. */
export type {
  AgentInput,
  AgentResult,
  AgentRunOptions,
  AgentStream,
  GetSteeringMessagesFn,
  TransformContextFn,
} from "./agent.types.js";

export { createEmptyAssistantMessage, extractText, extractToolCalls } from "./agent.types.js";

/** Runtime stream event types exported from the runtime core type surface. */
export type { LlmStreamEvent, RuntimeEvent } from "./result.types.js";

export {
  isAgentEnd,
  isLlmStreamDone,
  isLlmStreamError,
  isLlmStreamTerminal,
  isRuntimeError,
} from "./result.types.js";
