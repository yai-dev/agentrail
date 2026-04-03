/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { ModelConfig } from "../agent/define-agent.js";
import type { AssistantMessage, Message } from "../types/message.types.js";
import type { LlmStreamEvent } from "../types/result.types.js";
import type { ToolDefinition } from "../types/tool.types.js";

/** Normalized request shape passed from the runtime loop to an LLM backend. */
export interface LlmRequest {
  /** Structured provider/model selection for the request. */
  readonly model: ModelConfig;
  /** Optional system prompt prepended before the request message list. */
  readonly systemPrompt?: string;
  /** Conversation history and current user input presented to the model. */
  readonly messages: Message[];
  /** Tools available to the model for structured tool calling. */
  readonly tools?: ToolDefinition[];
  /** Sampling temperature requested for the call. */
  readonly temperature?: number;
  /** Maximum number of completion tokens requested. */
  readonly maxTokens?: number;
  /** Enables provider-specific thinking or reasoning modes when supported. */
  readonly thinkingEnabled?: boolean;
  /** Abort signal for cancellation. */
  readonly signal?: AbortSignal;
}

/** Provider stream wrapper that yields incremental model events and a final message. */
export interface LlmStream extends AsyncIterable<LlmStreamEvent> {
  /** Resolves once the stream finishes and returns the completed assistant message. */
  result(): Promise<AssistantMessage>;
}

/** Low-level client used by the runtime loop to talk to LLM providers. */
export interface LlmClient {
  /** Starts a streamed model invocation for the given request. */
  stream(request: LlmRequest): LlmStream;
}

/** Provider adapter that knows how to stream requests for one provider family. */
export interface LlmProvider {
  /** Provider name used in `ModelConfig.provider`. */
  readonly provider: string;

  /** Starts a streamed model invocation for this provider. */
  stream(request: LlmRequest): LlmStream;
}
