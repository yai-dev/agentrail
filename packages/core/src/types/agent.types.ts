/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { ToolCall, UserContent } from "@/types/content.types.js";
import type { AssistantMessage, Message, StopReason } from "@/types/message.types.js";
import type { RuntimeEvent } from "@/types/result.types.js";
import type { ToolInterceptor } from "@/types/tool.types.js";
import type { Usage } from "@/types/usage.types.js";

// ============================================================================
// ============================================================================

/** Input accepted by an agent invocation. */
export type AgentInput = string | UserContent[] | Message[];

// ============================================================================
// ============================================================================

/**
 * Rewrites or augments the message list immediately before an agent run.
 *
 * @see {@link https://agentrail.run/guides/add-context}
 */
export type TransformContextFn = (messages: Message[], signal?: AbortSignal) => Promise<Message[]>;

export interface ReactiveCompactionRecord {
  strategy: "micro" | "full";
  trigger: "proactive" | "prompt_too_long";
  turnCount: number;
}

export interface ReactiveCompactionContext {
  messages: Message[];
  turnCount: number;
  usage?: Usage;
  latestMessage?: AssistantMessage;
  protectedMessages?: Message[];
  records: ReactiveCompactionRecord[];
}

export interface ReactiveCompactionDecision {
  messages: Message[];
  strategy: "micro" | "full";
  trigger: "proactive" | "prompt_too_long";
}

export interface ReactiveCompactionController {
  maybeCompact(
    context: ReactiveCompactionContext,
  ): Promise<ReactiveCompactionDecision | null> | ReactiveCompactionDecision | null;
  isPromptTooLongError?(message: AssistantMessage): boolean;
}

/** Loads extra steering messages lazily at invocation time. */
export type GetSteeringMessagesFn = () => Promise<Message[]>;

/** Optional overrides applied to a single agent invocation or stream. */
export interface AgentRunOptions {
  /** Prior conversation history that should be supplied before the new input. */
  readonly messages?: Message[];

  /** Per-call max token override. */
  readonly maxTokens?: number;

  /** Per-call sampling temperature override. */
  readonly temperature?: number;

  /** Per-call thinking or reasoning mode override. */
  readonly thinkingEnabled?: boolean;

  /** Abort signal used to cancel provider and tool execution. */
  readonly signal?: AbortSignal;

  /** Request-time message transformer applied just before execution. */
  readonly transformContext?: TransformContextFn;

  /** Optional in-loop compaction controller used to recover from context pressure. */
  readonly reactiveCompaction?: ReactiveCompactionController;

  /** Lazily loaded steering messages appended ahead of model execution. */
  readonly getSteeringMessages?: GetSteeringMessagesFn;

  /** Per-call max-turn override for the agent loop. */
  readonly maxTurns?: number;

  /** Assistant-facing message used when the max-turn limit is reached. */
  readonly maxTurnsMessage?: string;

  /**
   * Optional pre/post hook interceptor for individual tool calls.
   *
   * The interceptor runs inside the core executor: `onBeforeToolCall` just
   * before the tool's `execute()` is called and `onAfterToolCall` after the
   * result is produced.  Multi-plugin composition is handled by the host layer
   * (see `buildToolInterceptor` in `@agentrail/app`).
   */
  readonly toolInterceptor?: ToolInterceptor;

  /**
   * Stable correlation ID for the entire request chain, shared by the root
   * agent and all descendant sub-agents.  When absent, `agentLoop` generates a
   * random UUID.  In the app layer this should be set to the route-level
   * `traceId` so that `RuntimeEvent.chainId === telemetry traceId`.
   */
  readonly chainId?: string;

  /**
   * Nesting depth within a multi-agent hierarchy.  `0` for the root agent,
   * incremented by 1 for each orchestration level.  Defaults to `0`.
   */
  readonly depth?: number;
}

// ============================================================================
// ============================================================================

/** Final materialized result of an agent invocation. */
export interface AgentResult {
  /** Messages produced during the invocation, including tool results. */
  readonly messages: Message[];

  /** Final assistant message returned by the agent loop. */
  readonly lastMessage: AssistantMessage;

  /** Aggregated token and cost usage for the invocation. */
  readonly usage: Usage;

  /** Stop reason reported by the final model turn. */
  readonly stopReason: StopReason;

  /** Convenience text extraction from the final assistant message. */
  readonly text: string;

  /** Tool calls extracted from the final assistant message. */
  readonly toolCalls: ToolCall[];
}

// ============================================================================
// ============================================================================

/** Streaming variant of an agent run that yields runtime events as they happen. */
export interface AgentStream extends AsyncIterable<RuntimeEvent> {
  /** Resolves once the stream is complete and returns the same shape as `invoke()`. */
  result(): Promise<AgentResult>;
}

// ============================================================================
// ============================================================================

/** Concatenates all text content blocks from an assistant message. */
export function extractText(message: AssistantMessage): string {
  return message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/** Returns only the tool call blocks from an assistant message. */
export function extractToolCalls(message: AssistantMessage): ToolCall[] {
  return message.content.filter((block): block is ToolCall => block.type === "toolCall");
}

/** Creates a zero-usage assistant message placeholder for incremental stream assembly. */
export function createEmptyAssistantMessage(): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    provider: "unknown",
    modelId: "unknown",
    usage: {
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
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}
