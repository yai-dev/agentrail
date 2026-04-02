/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/** Content block types used across runtime messages and tool results. */
export type {
  TextContent,
  ThinkingContent,
  ImageContent,
  ToolCall,
  AssistantContent,
  UserContent,
  ToolResultContent,
} from "./content.types.js";

/** Token and cost accounting types exported from the runtime core type surface. */
export type { Cost, Usage } from "./usage.types.js";

/** Message role and envelope types exported from the runtime core type surface. */
export type {
  StopReason,
  Provider,
  ApiType,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  Message,
} from "./message.types.js";

export { isUserMessage, isAssistantMessage, isToolResultMessage } from "./message.types.js";

/** Tool contract and helper types exported from the runtime core type surface. */
export type {
  ToolDefinition,
  ToolResult,
  ToolUpdateCallback,
  RuntimeTool,
  ExtractToolParams,
  ExtractToolDetails,
} from "./tool.types.js";

/** Agent invocation input/output types exported from the runtime core type surface. */
export type {
  AgentInput,
  AgentRunOptions,
  AgentResult,
  AgentStream,
  TransformContextFn,
  GetSteeringMessagesFn,
} from "./agent.types.js";

export { extractText, extractToolCalls, createEmptyAssistantMessage } from "./agent.types.js";

/** Runtime stream event types exported from the runtime core type surface. */
export type { LlmStreamEvent, RuntimeEvent } from "./result.types.js";

export {
  isLlmStreamDone,
  isLlmStreamError,
  isLlmStreamTerminal,
  isAgentEnd,
  isRuntimeError,
} from "./result.types.js";
