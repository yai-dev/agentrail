/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { Value } from "@sinclair/typebox/value";
import type { TSchema, Static } from "@sinclair/typebox";
import type { ToolCall } from "../../types/content.types.js";
import type { ToolDefinition } from "../../types/tool.types.js";
import { ToolValidationError } from "../../errors.js";

/** Validates raw tool-call arguments against a TypeBox schema and returns typed data. */
export function validateToolArguments<T extends TSchema>(
  tool: ToolDefinition<T>,
  toolCall: ToolCall,
): Static<T> {
  if (!Value.Check(tool.parameters, toolCall.arguments)) {
    const errors = [...Value.Errors(tool.parameters, toolCall.arguments)].map((error) => ({
      path: error.path,
      message: error.message,
    }));
    throw new ToolValidationError(
      `Invalid arguments for tool "${toolCall.name}"`,
      toolCall.name,
      errors,
    );
  }
  return toolCall.arguments as Static<T>;
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
