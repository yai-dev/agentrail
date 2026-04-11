/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { ToolValidationError } from "@/errors.js";
import type { ToolCall } from "@/types/content.types.js";
import type { ToolDefinition } from "@/types/tool.types.js";

/**
 * Validates a raw value against a tool's TypeBox schema and returns typed data.
 *
 * Unlike `validateToolArguments`, this accepts a bare `unknown` value rather
 * than a `ToolCall` object. It is used by the executor to re-validate arguments
 * after an `onBeforeToolCall` interceptor may have rewritten them.
 */
export function validateToolInput<T extends TSchema>(
  tool: ToolDefinition<T>,
  input: unknown,
): Static<T> {
  if (!Value.Check(tool.parameters, input)) {
    const errors = [...Value.Errors(tool.parameters, input)].map((error) => ({
      path: error.path,
      message: error.message,
    }));
    throw new ToolValidationError(`Invalid arguments for tool "${tool.name}"`, tool.name, errors);
  }
  return input as Static<T>;
}

/** Validates raw tool-call arguments against a TypeBox schema and returns typed data. */
export function validateToolArguments<T extends TSchema>(
  tool: ToolDefinition<T>,
  toolCall: ToolCall,
): Static<T> {
  return validateToolInput(tool, toolCall.arguments);
}

/** Validates a model-emitted tool call against a declared runtime tool. */
export function validateToolCall<T extends TSchema>(
  tools: ToolDefinition<T>[],
  toolCall: ToolCall,
): Static<T> {
  const tool = tools.find((t) => t.name === toolCall.name);
  if (!tool) {
    throw new ToolValidationError(`Tool "${toolCall.name}" not found`, toolCall.name);
  }
  return validateToolArguments(tool, toolCall);
}
