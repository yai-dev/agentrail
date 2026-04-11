/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { tool, type ToolExecutionContext } from "@/tools/tool-builder.js";
import type {
  RuntimeTool,
  ToolResult,
  ToolValidationContext,
  ValidationResult,
} from "@/types/tool.types.js";
import { Type, type Static, type TSchema } from "@sinclair/typebox";

/**
 * Defines a runtime tool using an object-style declaration.
 *
 * This is the preferred API for defining tools in Agentrail.
 * The fluent `tool()` builder remains available for advanced use cases.
 *
 * @example
 * ```ts
 * const weatherTool = defineTool({
 *   name: "get_weather",
 *   description: "Get the weather for a city.",
 *   parameters: Type.Object({ city: Type.String() }),
 *   async execute({ city }) {
 *     return {
 *       content: [{ type: "text", text: `${city}: sunny, 26°C` }],
 *       details: { city, condition: "sunny", temperatureC: 26 },
 *     };
 *   },
 * });
 * ```
 *
 * @see {@link https://agentrail.run/concepts/tools}
 */
export function defineTool<TSchema_ extends TSchema, TDetails>(options: {
  /** Stable tool name exposed to the model. */
  name: string;
  /** Optional human-readable label used in logs and UI surfaces. */
  label?: string;
  /** Description shown to the model for tool selection. */
  description: string;
  /** TypeBox schema describing the accepted parameters. */
  parameters?: TSchema_;
  /**
   * Optional business-logic precondition check.
   *
   * Called after schema validation and after any `onBeforeToolCall` interceptor
   * has rewritten the arguments, but before `execute`. Returning
   * `{ valid: false }` or throwing prevents execution.
   */
  validate?: (
    params: Static<TSchema_>,
    ctx: ToolValidationContext,
  ) => Promise<ValidationResult> | ValidationResult;
  /** Async implementation invoked when the tool is called. */
  execute: (params: Static<TSchema_>, ctx: ToolExecutionContext) => Promise<ToolResult<TDetails>>;
}): RuntimeTool {
  const schema = options.parameters ?? Type.Object({});
  let builder = tool()
    .name(options.name)
    .label(options.label ?? options.name)
    .description(options.description)
    .parameters(schema)
    .execute(
      options.execute as (
        params: Static<typeof schema>,
        ctx: ToolExecutionContext,
      ) => Promise<ToolResult<TDetails>>,
    );

  if (options.validate) {
    const validateFn = options.validate;
    builder = builder.validate(
      validateFn as (
        params: Static<typeof schema>,
        ctx: ToolValidationContext,
      ) => Promise<ValidationResult> | ValidationResult,
    );
  }

  return builder.build();
}
