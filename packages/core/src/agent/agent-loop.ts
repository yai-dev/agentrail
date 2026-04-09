/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { executeToolCalls } from "@/executor/tool-executor.js";
import type { LlmClient, LlmRequest } from "@/interfaces/llm-client.js";
import { EventStream } from "@/llm/event-stream.js";
import type { TransformContextFn } from "@/types/agent.types.js";
import type { AssistantMessage, Message, ToolResultMessage } from "@/types/message.types.js";
import type { RuntimeEvent } from "@/types/result.types.js";
import type { RuntimeTool } from "@/types/tool.types.js";
import type { Usage } from "@/types/usage.types.js";
import type { ModelConfig } from "@/agent/define-agent.js";

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
}

/** Runs the core agent loop from the first user turn until completion. */
export function agentLoop(
  prompts: Message[],
  context: InternalContext,
  config: AgentLoopConfig,
): EventStream<RuntimeEvent, Message[]> {
  const stream = createAgentStream();

  (async () => {
    const newMessages: Message[] = [...prompts];
    const currentMessages: Message[] = [...context.messages, ...prompts];

    stream.push({ type: "session.start" });
    stream.push({ type: "turn.start" });

    for (const prompt of prompts) {
      stream.push({ type: "message.start", message: prompt });
      stream.push({ type: "message.end", message: prompt });
    }

    await runLoop(currentMessages, newMessages, config, context.signal, stream);
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

  (async () => {
    const newMessages: Message[] = [];
    const currentMessages: Message[] = [...context.messages];

    stream.push({ type: "session.start" });
    stream.push({ type: "turn.start" });

    await runLoop(currentMessages, newMessages, config, context.signal, stream);
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
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  stream: EventStream<RuntimeEvent, Message[]>,
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

  while (true) {
    let hasMoreToolCalls = true;
    let steeringAfterTools: Message[] | null = null;

    while (hasMoreToolCalls || pendingMessages.length > 0) {
      if (!firstTurn) {
        stream.push({ type: "turn.start" });
      } else {
        firstTurn = false;
      }

      if (pendingMessages.length > 0) {
        for (const message of pendingMessages) {
          stream.push({ type: "message.start", message });
          stream.push({ type: "message.end", message });
          currentMessages.push(message);
          newMessages.push(message);
        }
        pendingMessages = [];
      }

      turnCount++;

      const isLastTurn = config.spec.maxTurns !== undefined && turnCount >= config.spec.maxTurns;
      if (isLastTurn) {
        stream.push({ type: "max_turns_reached", turnCount });
      }

      const message = await streamAssistantResponse(
        currentMessages,
        config,
        signal,
        stream,
        config.spec.maxTurns !== undefined ? { turnCount, isLastTurn } : undefined,
      );
      newMessages.push(message);

      totalUsage = accumulateUsage(totalUsage, message.usage);

      if (message.stopReason === "error" || message.stopReason === "aborted") {
        stream.push({ type: "turn.complete", message, toolResults: [] });
        stream.push({ type: "session.end", messages: newMessages, usage: totalUsage });
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
          config.getSteeringMessages,
        );
        toolResults.push(...toolExecution.toolResults);
        steeringAfterTools = toolExecution.steeringMessages ?? null;

        for (const result of toolResults) {
          currentMessages.push(result);
          newMessages.push(result);
        }
      }

      stream.push({ type: "turn.complete", message, toolResults });

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

  stream.push({ type: "session.end", messages: newMessages, usage: totalUsage });
  stream.end(newMessages);
}

async function streamAssistantResponse(
  messages: Message[],
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  stream: EventStream<RuntimeEvent, Message[]>,
  turnContext?: { turnCount: number; isLastTurn: boolean },
): Promise<AssistantMessage> {
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
        stream.push({ type: "message.start", message: { ...partialMessage } });
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
          });
        }
        break;

      case "done":
      case "error": {
        const finalMessage = await llmStream.result();
        if (addedPartial) {
          messages[messages.length - 1] = finalMessage;
        } else {
          messages.push(finalMessage);
        }
        if (!addedPartial) {
          stream.push({ type: "message.start", message: { ...finalMessage } });
        }
        stream.push({ type: "message.end", message: finalMessage });
        return finalMessage;
      }
    }
  }

  return await llmStream.result();
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
