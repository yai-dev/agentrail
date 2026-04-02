/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Agent } from "../interfaces/agent.js";
import type { LlmClient } from "../interfaces/llm-client.js";
import type { RuntimeTool } from "../types/tool.types.js";

// ============================================================================
// ============================================================================

/**
 * Selects the model provider and model identifier used for an agent run.
 *
 * @see {@link https://agentrail.run/concepts/agents}
 */
export interface ModelConfig {
  /** Registered provider name, such as `openai` or `anthropic`. */
  readonly provider: string;

  /** Provider-specific model identifier passed through to the LLM client. */
  readonly modelId: string;

  /** Optional API key override for providers that allow per-agent credentials. */
  readonly apiKey?: string;

  /** Optional base URL override for compatible provider endpoints. */
  readonly baseUrl?: string;
}

// ============================================================================
// ============================================================================

/**
 * Declares the runtime behavior for an Agentrail agent.
 *
 * This configuration is consumed by {@link defineAgent} to create an
 * executable {@link Agent} instance.
 *
 * @see {@link https://agentrail.run/concepts/agents}
 */
export interface AgentConfig {
  /** Stable identifier used by host layers to look up this agent. */
  readonly id: string;

  /** Human-readable name used in logs and debugging output. */
  readonly name?: string;

  /** Model reference as either `provider:modelId` shorthand or a structured config object. */
  readonly model: string | ModelConfig;

  /** System prompt applied before conversation history and request-time context. */
  readonly system: string;

  /** Tools exposed to the agent during tool-use turns. */
  readonly tools?: RuntimeTool[] | Record<string, RuntimeTool>;

  /** Maximum number of output tokens requested from the provider. */
  readonly maxTokens?: number;

  /** Sampling temperature forwarded to the provider when supported. */
  readonly temperature?: number;

  /** Enables provider-specific reasoning or thinking modes when available. */
  readonly thinkingEnabled?: boolean;

  /** Hard cap on agent loop turns before the runtime stops. */
  readonly maxTurns?: number;

  /** Assistant-facing message appended when the max-turn limit is reached. */
  readonly maxTurnsMessage?: string;

  /** Custom LLM client override for advanced hosting or testing scenarios. */
  readonly llmClient?: LlmClient;
}

// ============================================================================
// ============================================================================

/**
 * Creates an executable agent from a declarative configuration object.
 *
 * @example
 * ```ts
 * const agent = defineAgent({
 *   id: "support",
 *   model: "openai:gpt-5.4",
 *   system: "You are a helpful support agent.",
 * });
 * ```
 *
 * @see {@link https://agentrail.run/concepts/agents}
 */
export function defineAgent(config: AgentConfig): Agent {
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  return new AgentImpl(config);
}

// ============================================================================
// ============================================================================

import { AgentImpl } from "./agent-impl.js";

export { AgentImpl } from "./agent-impl.js";
