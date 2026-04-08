/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { ToolNotFoundError } from "@/errors.js";
import { EventStream } from "@/llm/event-stream.js";
import { validateToolArguments } from "@/llm/utils/validation.js";
import type { TextContent, ToolCall } from "@/types/content.types.js";
import type { AssistantMessage, Message, ToolResultMessage } from "@/types/message.types.js";
import type { RuntimeEvent } from "@/types/result.types.js";
import type { RuntimeTool, ToolResult, ToolSignalEvent } from "@/types/tool.types.js";

/** Result produced by executing a single tool call against the runtime registry. */
export interface ToolExecutionResult {
  toolResults: ToolResultMessage[];
  steeringMessages?: Message[];
}

export async function executeToolCalls(
  tools: RuntimeTool[] | undefined,
  assistantMessage: AssistantMessage,
  signal: AbortSignal | undefined,
  stream: EventStream<RuntimeEvent, Message[]>,
  getSteeringMessages?: () => Promise<Message[]>,
): Promise<ToolExecutionResult> {
  const toolCalls = assistantMessage.content.filter((c): c is ToolCall => c.type === "toolCall");
  const results: ToolResultMessage[] = [];
  let steeringMessages: Message[] | undefined;

  for (let index = 0; index < toolCalls.length; index++) {
    const toolCall = toolCalls[index];
    const tool = tools?.find((t) => t.name === toolCall.name);

    stream.push({
      type: "tool.before",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: toolCall.arguments,
    });

    let result: ToolResult;
    let isError = false;

    try {
      if (!tool) {
        throw new ToolNotFoundError(toolCall.name);
      }

      const validatedArgs = validateToolArguments(tool, toolCall);

      const onSignal = (event: ToolSignalEvent) => {
        if (event.type === "waiting_for_input") {
          stream.push({
            type: "waiting_for_user_input",
            toolCallId: toolCall.id,
            question: event.question,
            hint: event.hint,
            options: event.options,
            multiple: event.multiple,
            custom: event.custom,
          });
        }
      };

        result = await tool.execute(
        toolCall.id,
        validatedArgs,
        signal,
        (partialResult) => {
          stream.push({
            type: "tool.update",
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            partialResult,
          });
        },
        onSignal,
      );
    } catch (e) {
      result = {
        content: [
          {
            type: "text",
            text: e instanceof Error ? e.message : String(e),
          } as TextContent,
        ],
        details: {},
      };
      isError = true;
    }

    stream.push({
      type: "tool.after",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      result,
      isError,
    });

    const toolResultMessage: ToolResultMessage = {
      role: "toolResult",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: result.content,
      details: result.details,
      isError,
      timestamp: Date.now(),
    };

    results.push(toolResultMessage);
    stream.push({ type: "message.start", message: toolResultMessage });
    stream.push({ type: "message.end", message: toolResultMessage });

    if (getSteeringMessages) {
      const steering = await getSteeringMessages();
      if (steering.length > 0) {
        steeringMessages = steering;
        const remainingCalls = toolCalls.slice(index + 1);
        for (const skipped of remainingCalls) {
          results.push(skipToolCall(skipped, stream));
        }
        break;
      }
    }
  }

  return { toolResults: results, steeringMessages };
}

function skipToolCall(
  toolCall: ToolCall,
  stream: EventStream<RuntimeEvent, Message[]>,
): ToolResultMessage {
  const result: ToolResult = {
    content: [{ type: "text", text: "Skipped due to queued user message." } as TextContent],
    details: {},
  };

  stream.push({
    type: "tool.before",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    args: toolCall.arguments,
  });
  stream.push({
    type: "tool.after",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    result,
    isError: true,
  });

  const toolResultMessage: ToolResultMessage = {
    role: "toolResult",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: result.content,
    details: {},
    isError: true,
    timestamp: Date.now(),
  };

  stream.push({ type: "message.start", message: toolResultMessage });
  stream.push({ type: "message.end", message: toolResultMessage });

  return toolResultMessage;
}
