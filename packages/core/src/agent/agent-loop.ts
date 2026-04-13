/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { ModelConfig } from "@/agent/define-agent.js";
import { executeToolCalls } from "@/executor/tool-executor.js";
import type { LlmClient, LlmRequest } from "@/interfaces/llm-client.js";
import { EventStream } from "@/llm/event-stream.js";
import type {
  ReactiveCompactionController,
  ReactiveCompactionRecord,
  TransformContextFn,
} from "@/types/agent.types.js";
import type { AssistantMessage, Message, ToolResultMessage } from "@/types/message.types.js";
import type { RuntimeEvent, RuntimeTracingFields } from "@/types/result.types.js";
import type { PermissionApprovalHandler, RuntimeTool, ToolInterceptor } from "@/types/tool.types.js";
import type { Usage } from "@/types/usage.types.js";
import { randomUUID } from "node:crypto";

// ============================================================================
// ============================================================================

/** Internal normalized agent specification consumed by the core loop. */
export interface InternalSpec {
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

/** Internal execution context shared across loop iterations. */
export interface InternalContext {
  conversationId: string;
  messages: Message[];
  signal?: AbortSignal;
  transformContext?: TransformContextFn;
  metadata?: Record<string, unknown>;
  /** Correlation ID for the full request chain (root + all descendants). Auto-generated if absent. */
  chainId?: string;
  /** Nesting depth: 0 = root agent, +1 per orchestration level. */
  depth?: number;
}

// ============================================================================
// AgentLoopConfig
// ============================================================================

/** Low-level configuration for the core agent loop implementation. */
export interface AgentLoopConfig {
  spec: InternalSpec;
  llmClient: LlmClient;
  getSteeringMessages?: () => Promise<Message[]>;
  getFollowUpMessages?: () => Promise<Message[]>;
  transformContext?: TransformContextFn;
  reactiveCompaction?: ReactiveCompactionController;
  /** Optional pre/post interceptor invoked around each tool execution. */
  toolInterceptor?: ToolInterceptor;
  /** Optional handler that converts an "ask" permission decision into a suspend-and-resume. */
  permissionApprovalHandler?: PermissionApprovalHandler;
}

/** Runs the core agent loop from the first user turn until completion. */
export function agentLoop(
  prompts: Message[],
  context: InternalContext,
  config: AgentLoopConfig,
): EventStream<RuntimeEvent, Message[]> {
  const stream = createAgentStream();
  const chainId = context.chainId ?? randomUUID();
  const depth = context.depth ?? 0;
  const preLoopTracing: RuntimeTracingFields = { chainId, depth, turnIndex: 0 };

  (async () => {
    const newMessages: Message[] = [...prompts];
    const currentMessages: Message[] = [...context.messages, ...prompts];

    stream.push({ type: "session.start", ...preLoopTracing });
    stream.push({ type: "turn.start", ...preLoopTracing });

    for (const prompt of prompts) {
      stream.push({ type: "message.start", message: prompt, ...preLoopTracing });
      stream.push({ type: "message.end", message: prompt, ...preLoopTracing });
    }

    await runLoop(
      currentMessages,
      newMessages,
      prompts,
      config,
      context.signal,
      stream,
      chainId,
      depth,
    );
  })();

  return stream;
}

/** Continues the core agent loop after tool execution returns control. */
export function agentLoopContinue(
  context: InternalContext,
  config: AgentLoopConfig,
): EventStream<RuntimeEvent, Message[]> {
  if (context.messages.length === 0) {
    throw new Error("Cannot continue: no messages in context");
  }

  if (context.messages[context.messages.length - 1].role === "assistant") {
    throw new Error("Cannot continue from message role: assistant");
  }

  const stream = createAgentStream();
  const chainId = context.chainId ?? randomUUID();
  const depth = context.depth ?? 0;
  const preLoopTracing: RuntimeTracingFields = { chainId, depth, turnIndex: 0 };

  (async () => {
    const newMessages: Message[] = [];
    const currentMessages: Message[] = [...context.messages];

    stream.push({ type: "session.start", ...preLoopTracing });
    stream.push({ type: "turn.start", ...preLoopTracing });

    await runLoop(currentMessages, newMessages, [], config, context.signal, stream, chainId, depth);
  })();

  return stream;
}

function createAgentStream(): EventStream<RuntimeEvent, Message[]> {
  return new EventStream<RuntimeEvent, Message[]>(
    (event: RuntimeEvent) => event.type === "session.end",
    (event: RuntimeEvent) => (event.type === "session.end" ? event.messages : []),
  );
}

const DEFAULT_MAX_TURNS_FINAL_HINT =
  "You have reached the maximum number of turns. Respond directly to the user now. Do not make any tool calls.";

async function runLoop(
  currentMessages: Message[],
  newMessages: Message[],
  protectedMessages: Message[],
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  stream: EventStream<RuntimeEvent, Message[]>,
  chainId: string,
  depth: number,
): Promise<void> {
  let firstTurn = true;
  let turnCount = 0;
  let maxTurnsReached = false;
  let pendingMessages: Message[] = (await config.getSteeringMessages?.()) || [];

  let totalUsage: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
  const compactionRecords: ReactiveCompactionRecord[] = [];

  while (true) {
    let hasMoreToolCalls = true;
    let steeringAfterTools: Message[] | null = null;

    while (hasMoreToolCalls || pendingMessages.length > 0) {
      if (!firstTurn) {
        // turnIndex for this turn.start will be set after turnCount++ below
      } else {
        firstTurn = false;
      }

      if (pendingMessages.length > 0) {
        // These steering messages belong to the upcoming turn; stamp with current
        // turnCount (still pre-increment, so turnIndex = turnCount).  In practice
        // these are emitted before the LLM call so turnCount hasn't advanced yet.
        const steeringTracing: RuntimeTracingFields = { chainId, depth, turnIndex: turnCount };
        for (const message of pendingMessages) {
          stream.push({ type: "message.start", message, ...steeringTracing });
          stream.push({ type: "message.end", message, ...steeringTracing });
          currentMessages.push(message);
          newMessages.push(message);
        }
        pendingMessages = [];
      }

      turnCount++;
      const turnIndex = turnCount - 1; // 0-based
      const tracing: RuntimeTracingFields = { chainId, depth, turnIndex };

      // Emit turn.start for non-first turns (first turn.start was emitted pre-loop).
      if (turnCount > 1) {
        stream.push({ type: "turn.start", ...tracing });
      }

      const isLastTurn = config.spec.maxTurns !== undefined && turnCount >= config.spec.maxTurns;
      if (isLastTurn) {
        stream.push({ type: "max_turns_reached", turnCount, ...tracing });
      }

      const assistantResult = await streamAssistantResponse(
        currentMessages,
        config,
        signal,
        stream,
        tracing,
        config.spec.maxTurns !== undefined ? { turnCount, isLastTurn } : undefined,
      );
      const message = assistantResult.message;

      if (assistantResult.recoverablePromptTooLong && config.reactiveCompaction) {
        const compactedMessages = await maybeApplyReactiveCompaction(
          currentMessages,
          config.reactiveCompaction,
          stream,
          tracing,
          {
            turnCount,
            latestMessage: message,
            protectedMessages,
            records: compactionRecords,
            trigger: "prompt_too_long",
          },
        );
        if (compactedMessages) {
          currentMessages.splice(0, currentMessages.length, ...compactedMessages);
          continue;
        }
        emitFinalAssistantMessage(currentMessages, stream, tracing, message);
      }

      newMessages.push(message);
      totalUsage = accumulateUsage(totalUsage, message.usage);

      if (message.stopReason === "error" || message.stopReason === "aborted") {
        stream.push({ type: "turn.complete", message, toolResults: [], ...tracing });
        stream.push({ type: "session.end", messages: newMessages, usage: totalUsage, ...tracing });
        stream.end(newMessages);
        return;
      }

      const toolCalls = message.content.filter((c) => c.type === "toolCall");
      hasMoreToolCalls = toolCalls.length > 0;

      const toolResults: ToolResultMessage[] = [];
      if (hasMoreToolCalls) {
        const toolExecution = await executeToolCalls(
          config.spec.tools as RuntimeTool[] | undefined,
          message,
          signal,
          stream,
          tracing,
          config.getSteeringMessages,
          config.toolInterceptor,
          config.permissionApprovalHandler,
        );
        toolResults.push(...toolExecution.toolResults);
        steeringAfterTools = toolExecution.steeringMessages ?? null;

        for (const result of toolResults) {
          currentMessages.push(result);
          newMessages.push(result);
        }
      }

      stream.push({ type: "turn.complete", message, toolResults, ...tracing });

      const compactedMessages = config.reactiveCompaction
        ? await maybeApplyReactiveCompaction(
            currentMessages,
            config.reactiveCompaction,
            stream,
            tracing,
            {
              turnCount,
              usage: message.usage,
              latestMessage: message,
              protectedMessages,
              records: compactionRecords,
              trigger: "proactive",
            },
          )
        : null;
      if (compactedMessages) {
        currentMessages.splice(0, currentMessages.length, ...compactedMessages);
      }

      if (isLastTurn) {
        maxTurnsReached = true;
        break;
      }

      if (steeringAfterTools && steeringAfterTools.length > 0) {
        pendingMessages = steeringAfterTools;
        steeringAfterTools = null;
      } else {
        pendingMessages = (await config.getSteeringMessages?.()) || [];
      }
    }

    if (maxTurnsReached) break;

    const followUpMessages = (await config.getFollowUpMessages?.()) || [];
    if (followUpMessages.length > 0) {
      pendingMessages = followUpMessages;
      continue;
    }

    break;
  }

  // Compute the final tracing — turnCount at this point is the last completed turn.
  const finalTracing: RuntimeTracingFields = {
    chainId,
    depth,
    turnIndex: Math.max(0, turnCount - 1),
  };
  stream.push({ type: "session.end", messages: newMessages, usage: totalUsage, ...finalTracing });
  stream.end(newMessages);
}

async function streamAssistantResponse(
  messages: Message[],
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  stream: EventStream<RuntimeEvent, Message[]>,
  tracing: RuntimeTracingFields,
  turnContext?: { turnCount: number; isLastTurn: boolean },
): Promise<{ message: AssistantMessage; recoverablePromptTooLong: boolean }> {
  let transformedMessages = messages;
  if (config.transformContext) {
    transformedMessages = await config.transformContext(messages, signal);
  }

  const { maxTurns, maxTurnsMessage } = config.spec;
  let systemPrompt = config.spec.systemPrompt;
  if (maxTurns !== undefined && turnContext) {
    const { turnCount, isLastTurn } = turnContext;
    if (isLastTurn) {
      const finalHint = maxTurnsMessage ?? DEFAULT_MAX_TURNS_FINAL_HINT;
      systemPrompt += `\n\n${finalHint}`;
    } else {
      systemPrompt += `\n\n[Turn ${turnCount}/${maxTurns}]`;
    }
  }

  const request: LlmRequest = {
    model: config.spec.model,
    systemPrompt,
    messages: transformedMessages,
    tools: turnContext?.isLastTurn ? undefined : config.spec.tools,
    maxTokens: config.spec.maxTokens,
    temperature: config.spec.temperature,
    thinkingEnabled: config.spec.thinkingEnabled,
    signal,
  };

  const llmStream = config.llmClient.stream(request);

  let partialMessage: AssistantMessage | null = null;
  let addedPartial = false;

  for await (const event of llmStream) {
    switch (event.type) {
      case "start":
        partialMessage = event.partial;
        messages.push(partialMessage);
        addedPartial = true;
        stream.push({ type: "message.start", message: { ...partialMessage }, ...tracing });
        break;

      case "text_start":
      case "text_delta":
      case "text_end":
      case "thinking_start":
      case "thinking_delta":
      case "thinking_end":
      case "toolcall_start":
      case "toolcall_delta":
      case "toolcall_end":
        if (partialMessage) {
          partialMessage = event.partial;
          messages[messages.length - 1] = partialMessage;
          stream.push({
            type: "message.update",
            message: { ...partialMessage },
            event,
            ...tracing,
          });
        }
        break;

      case "done":
      case "error": {
        const finalMessage = await llmStream.result();
        const recoverablePromptTooLong =
          event.type === "error" &&
          Boolean(config.reactiveCompaction?.isPromptTooLongError?.(finalMessage));
        if (recoverablePromptTooLong) {
          if (addedPartial) {
            messages.pop();
          }
          return { message: finalMessage, recoverablePromptTooLong: true };
        }
        if (addedPartial) {
          messages[messages.length - 1] = finalMessage;
        } else {
          messages.push(finalMessage);
        }
        if (!addedPartial) {
          stream.push({ type: "message.start", message: { ...finalMessage }, ...tracing });
        }
        stream.push({ type: "message.end", message: finalMessage, ...tracing });
        return { message: finalMessage, recoverablePromptTooLong: false };
      }
    }
  }

  return { message: await llmStream.result(), recoverablePromptTooLong: false };
}

async function maybeApplyReactiveCompaction(
  messages: Message[],
  controller: ReactiveCompactionController,
  stream: EventStream<RuntimeEvent, Message[]>,
  tracing: RuntimeTracingFields,
  input: {
    turnCount: number;
    usage?: Usage;
    latestMessage?: AssistantMessage;
    protectedMessages: Message[];
    records: ReactiveCompactionRecord[];
    trigger: "proactive" | "prompt_too_long";
  },
): Promise<Message[] | null> {
  const decision = await controller.maybeCompact({
    messages,
    turnCount: input.turnCount,
    usage: input.usage,
    latestMessage: input.latestMessage,
    protectedMessages: input.protectedMessages,
    records: input.records,
  });
  if (!decision || decision.trigger !== input.trigger) {
    return null;
  }

  input.records.push({
    strategy: decision.strategy,
    trigger: decision.trigger,
    turnCount: input.turnCount,
  });
  stream.push({
    type: "compaction",
    messagesBefore: messages.length,
    messagesAfter: decision.messages.length,
    ...tracing,
  });
  return decision.messages;
}

function emitFinalAssistantMessage(
  messages: Message[],
  stream: EventStream<RuntimeEvent, Message[]>,
  tracing: RuntimeTracingFields,
  message: AssistantMessage,
): void {
  messages.push(message);
  stream.push({ type: "message.start", message: { ...message }, ...tracing });
  stream.push({ type: "message.end", message, ...tracing });
}

function accumulateUsage(total: Usage, current: Usage): Usage {
  return {
    inputTokens: total.inputTokens + current.inputTokens,
    outputTokens: total.outputTokens + current.outputTokens,
    cacheReadTokens: total.cacheReadTokens + current.cacheReadTokens,
    cacheWriteTokens: total.cacheWriteTokens + current.cacheWriteTokens,
    totalTokens: total.totalTokens + current.totalTokens,
    cost: {
      input: total.cost.input + current.cost.input,
      output: total.cost.output + current.cost.output,
      cacheRead: total.cost.cacheRead + current.cost.cacheRead,
      cacheWrite: total.cost.cacheWrite + current.cost.cacheWrite,
      total: total.cost.total + current.cost.total,
    },
  };
}
