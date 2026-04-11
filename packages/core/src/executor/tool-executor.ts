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
import type { RuntimeTool, ToolInterceptor, ToolResult, ToolSignalEvent } from "@/types/tool.types.js";

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
  toolInterceptor?: ToolInterceptor,
): Promise<ToolExecutionResult> {
  const toolCalls = assistantMessage.content.filter((c): c is ToolCall => c.type === "toolCall");
  const results: ToolResultMessage[] = [];
  let steeringMessages: Message[] | undefined;

  for (let index = 0; index < toolCalls.length; index++) {
    const toolCall = toolCalls[index];
    const tool = tools?.find((t) => t.name === toolCall.name);
    const rawArgs: unknown = toolCall.arguments;

    // ── Tool not found — emit events and move on ──────────────────────────────
    if (!tool) {
      const errorText = new ToolNotFoundError(toolCall.name).message;
      const errorResult: ToolResult = {
        content: [{ type: "text", text: errorText } as TextContent],
        details: {},
      };
      stream.push({ type: "tool.before", toolCallId: toolCall.id, toolName: toolCall.name, args: rawArgs, rawArgs });
      stream.push({ type: "tool.after", toolCallId: toolCall.id, toolName: toolCall.name, result: errorResult, isError: true });
      const msg = buildToolResultMessage(toolCall, errorResult, true);
      results.push(msg);
      stream.push({ type: "message.start", message: msg });
      stream.push({ type: "message.end", message: msg });
      continue;
    }

    // ── Argument validation ───────────────────────────────────────────────────
    // validateToolArguments may throw ToolValidationError (or in malformed tool
    // fixtures, a TypeError). Guard it separately so validation errors become
    // error ToolResults rather than unhandled exceptions.
    let validatedArgs: unknown;
    let validationError: unknown = null;
    try {
      validatedArgs = validateToolArguments(tool, toolCall);
    } catch (e) {
      validationError = e;
    }

    if (validationError !== null) {
      const errorText = validationError instanceof Error ? validationError.message : String(validationError);
      const errorResult: ToolResult = {
        content: [{ type: "text", text: errorText } as TextContent],
        details: {},
      };
      stream.push({ type: "tool.before", toolCallId: toolCall.id, toolName: toolCall.name, args: rawArgs, rawArgs });
      stream.push({ type: "tool.after", toolCallId: toolCall.id, toolName: toolCall.name, result: errorResult, isError: true });
      const msg = buildToolResultMessage(toolCall, errorResult, true);
      results.push(msg);
      stream.push({ type: "message.start", message: msg });
      stream.push({ type: "message.end", message: msg });
      continue;
    }

    // ── Before-hook (NOT in try/catch — interceptor errors propagate uncaught) ──
    // The host layer (buildToolInterceptor) is responsible for ensuring the
    // composed interceptor never throws.
    let effectiveArgs: unknown = validatedArgs;

    if (toolInterceptor?.onBeforeToolCall) {
      const beforeResult = await toolInterceptor.onBeforeToolCall({
        toolName: toolCall.name,
        // Pass validatedArgs as-is. The core layer does not assume the schema is
        // an object, so no spread or clone is applied here. Defensive copying for
        // cross-plugin mutation isolation is the app layer's responsibility
        // (see buildToolInterceptor in @agentrail/app).
        input: validatedArgs,
      });

      if (beforeResult.action === "deny") {
        const denyResult: ToolResult = {
          content: [{ type: "text", text: beforeResult.reason } as TextContent],
          details: {},
        };
        // tool.before is emitted even for denied calls so stream consumers always
        // see a matching before/after pair.
        stream.push({ type: "tool.before", toolCallId: toolCall.id, toolName: toolCall.name, args: rawArgs, rawArgs });
        stream.push({ type: "tool.after", toolCallId: toolCall.id, toolName: toolCall.name, result: denyResult, isError: true });
        const msg = buildToolResultMessage(toolCall, denyResult, true);
        results.push(msg);
        stream.push({ type: "message.start", message: msg });
        stream.push({ type: "message.end", message: msg });
        // onAfterToolCall is NOT called for denied executions.
        continue;
      }

      if (beforeResult.action === "allow" && "input" in beforeResult) {
        effectiveArgs = beforeResult.input;
      }
    }

    // ── Emit tool.before with effective (post-hook) args ─────────────────────
    stream.push({
      type: "tool.before",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: effectiveArgs,
      rawArgs,
    });

    // ── Execute ───────────────────────────────────────────────────────────────
    let result: ToolResult;
    let isError = false;
    let durationMs = 0;

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

    const startTime = Date.now();
    try {
      result = await tool.execute(
        toolCall.id,
        effectiveArgs,
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
          { type: "text", text: e instanceof Error ? e.message : String(e) } as TextContent,
        ],
        details: {},
      };
      isError = true;
    }
    durationMs = Date.now() - startTime;

    // ── Emit tool.after ───────────────────────────────────────────────────────
    stream.push({
      type: "tool.after",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      result,
      isError,
    });

    // ── After-hook (called for both success and execution errors, not for deny) ──
    // NOT in try/catch — see note on onBeforeToolCall above.
    if (toolInterceptor?.onAfterToolCall) {
      await toolInterceptor.onAfterToolCall({
        toolName: toolCall.name,
        input: effectiveArgs,
        result,
        durationMs,
      });
    }

    // ── Finalise ──────────────────────────────────────────────────────────────
    const toolResultMessage = buildToolResultMessage(toolCall, result, isError);
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

function buildToolResultMessage(
  toolCall: ToolCall,
  result: ToolResult,
  isError: boolean,
): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: result.content,
    details: result.details,
    isError,
    timestamp: Date.now(),
  };
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
    rawArgs: toolCall.arguments,
  });
  stream.push({
    type: "tool.after",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    result,
    isError: true,
  });

  const toolResultMessage = buildToolResultMessage(toolCall, result, true);
  stream.push({ type: "message.start", message: toolResultMessage });
  stream.push({ type: "message.end", message: toolResultMessage });

  return toolResultMessage;
}
