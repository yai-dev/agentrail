/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { ToolNotFoundError } from "@/errors.js";
import { EventStream } from "@/llm/event-stream.js";
import { validateToolArguments, validateToolInput } from "@/llm/utils/validation.js";
import type { TextContent, ToolCall } from "@/types/content.types.js";
import type { AssistantMessage, Message, ToolResultMessage } from "@/types/message.types.js";
import type { RuntimeEvent, RuntimeTracingFields } from "@/types/result.types.js";
import type {
  RuntimeTool,
  ToolInterceptor,
  ToolResult,
  ToolSignalEvent,
  ValidationResult,
} from "@/types/tool.types.js";
import type { Static, TSchema } from "@sinclair/typebox";

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
  tracing: RuntimeTracingFields,
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
      rejectToolCall(
        toolCall,
        new ToolNotFoundError(toolCall.name).message,
        rawArgs,
        rawArgs,
        stream,
        tracing,
        results,
      );
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
      rejectToolCall(
        toolCall,
        validationError instanceof Error ? validationError.message : String(validationError),
        rawArgs,
        rawArgs,
        stream,
        tracing,
        results,
      );
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
        // tool.before is emitted even for denied calls so stream consumers always
        // see a matching before/after pair.
        rejectToolCall(toolCall, beforeResult.reason, rawArgs, rawArgs, stream, tracing, results);
        // onAfterToolCall is NOT called for denied executions.
        continue;
      }

      if (beforeResult.action === "allow" && "input" in beforeResult) {
        effectiveArgs = beforeResult.input;
        // Re-validate schema after interceptor rewrite: the before-hook contract
        // allows returning an arbitrary unknown, so the shape may no longer match
        // the tool's TypeBox schema. Uses the same ToolValidationError format as
        // the initial validation above.
        let rewriteValidationError: unknown = null;
        try {
          validateToolInput(tool, effectiveArgs);
        } catch (e) {
          rewriteValidationError = e;
        }
        if (rewriteValidationError !== null) {
          // Use effectiveArgs (rewritten value) as args so the event reflects
          // the actual input that failed re-validation.
          rejectToolCall(
            toolCall,
            rewriteValidationError instanceof Error
              ? rewriteValidationError.message
              : String(rewriteValidationError),
            effectiveArgs,
            rawArgs,
            stream,
            tracing,
            results,
          );
          // onAfterToolCall is NOT called for schema re-validation failures.
          continue;
        }
      }
    }

    // ── Business-logic validation (tool.validate) ─────────────────────────────
    // Runs on the final effectiveArgs (post-interceptor) so tool-level
    // preconditions cannot be bypassed by a before-hook rewrite.
    if (tool.validate) {
      let vr: ValidationResult;
      try {
        vr = await tool.validate(effectiveArgs as Static<TSchema>, {
          toolCallId: toolCall.id,
          signal,
        });
      } catch (e) {
        vr = { valid: false, reason: e instanceof Error ? e.message : String(e) };
      }
      if (!vr.valid) {
        rejectToolCall(
          toolCall,
          `Tool precondition failed: ${vr.reason}`,
          effectiveArgs,
          rawArgs,
          stream,
          tracing,
          results,
        );
        // onAfterToolCall is NOT called for validate() failures.
        continue;
      }
    }

    // ── Emit tool.before with effective (post-hook) args ─────────────────────
    stream.push({
      type: "tool.before",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: effectiveArgs,
      rawArgs,
      ...tracing,
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
          ...tracing,
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
            ...tracing,
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
      ...tracing,
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
    stream.push({ type: "message.start", message: toolResultMessage, ...tracing });
    stream.push({ type: "message.end", message: toolResultMessage, ...tracing });

    if (getSteeringMessages) {
      const steering = await getSteeringMessages();
      if (steering.length > 0) {
        steeringMessages = steering;
        const remainingCalls = toolCalls.slice(index + 1);
        for (const skipped of remainingCalls) {
          results.push(skipToolCall(skipped, stream, tracing));
        }
        break;
      }
    }
  }

  return { toolResults: results, steeringMessages };
}

/**
 * Emits a tool.before/tool.after error pair, pushes a ToolResultMessage, and
 * appends it to `results`. Used for all early-exit failure paths (tool not
 * found, schema validation, deny, re-validation, validate()).
 *
 * Callers must `continue` (or `return`) after calling this to skip execution.
 * `onAfterToolCall` is intentionally NOT called here.
 */
function rejectToolCall(
  toolCall: ToolCall,
  errorText: string,
  args: unknown,
  rawArgs: unknown,
  stream: EventStream<RuntimeEvent, Message[]>,
  tracing: RuntimeTracingFields,
  results: ToolResultMessage[],
): void {
  const errorResult: ToolResult = {
    content: [{ type: "text", text: errorText } as TextContent],
    details: {},
  };
  stream.push({
    type: "tool.before",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    args,
    rawArgs,
    ...tracing,
  });
  stream.push({
    type: "tool.after",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    result: errorResult,
    isError: true,
    ...tracing,
  });
  const msg = buildToolResultMessage(toolCall, errorResult, true);
  results.push(msg);
  stream.push({ type: "message.start", message: msg, ...tracing });
  stream.push({ type: "message.end", message: msg, ...tracing });
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
  tracing: RuntimeTracingFields,
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
    ...tracing,
  });
  stream.push({
    type: "tool.after",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    result,
    isError: true,
    ...tracing,
  });

  const toolResultMessage = buildToolResultMessage(toolCall, result, true);
  stream.push({ type: "message.start", message: toolResultMessage, ...tracing });
  stream.push({ type: "message.end", message: toolResultMessage, ...tracing });

  return toolResultMessage;
}
