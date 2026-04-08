/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { Type, type Static, type TSchema } from "@sinclair/typebox";
import type { RuntimeTool, ToolResult, ToolSignalEvent } from "@/types/tool.types.js";

// ============================================================================
// ============================================================================

/**
 * Runtime context provided to a tool execution handler.
 *
 * @see {@link https://agentrail.run/concepts/tools}
 */
export interface ToolExecutionContext {
  /** Unique ID of the model-generated tool call being executed. */
  readonly toolCallId: string;

  /** Abort signal that fires when the enclosing request is cancelled. */
  readonly signal?: AbortSignal;

  /** Emits an incremental partial result while the tool is still running. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly onUpdate: (partialResult: ToolResult<any>) => void;

  /** Emits an out-of-band signal such as a request for human input. */
  readonly onSignal?: (event: ToolSignalEvent) => void;
}

// ============================================================================
// ============================================================================

interface ToolConfig<TParams, TDetails> {
  name?: string;
  label?: string;
  description?: string;
  parameters?: TSchema;
  execute?: (params: TParams, ctx: ToolExecutionContext) => Promise<ToolResult<TDetails>>;
}

/**
 * Fluent builder for creating strongly typed runtime tools.
 *
 * @see {@link https://agentrail.run/concepts/tools}
 */
export class ToolBuilder<TParams = undefined, TDetails = unknown> {
  private config: ToolConfig<TParams, TDetails> = {};

  /** Sets the stable tool name exposed to the model. */
  name(name: string): this {
    this.config.name = name;
    return this;
  }

  /** Sets a human-friendly display label for UI surfaces and logs. */
  label(label: string): this {
    this.config.label = label;
    return this;
  }

  /** Sets the instruction shown to the model when deciding whether to call the tool. */
  description(desc: string): this {
    this.config.description = desc;
    return this;
  }

  /** Attaches a TypeBox schema and narrows the execution parameter type from it. */
  parameters<T extends TSchema>(schema: T): ToolBuilder<Static<T>, TDetails> {
    const builder = new ToolBuilder<Static<T>, TDetails>();
    (builder as unknown as { config: ToolConfig<Static<T>, TDetails> }).config = {
      ...this.config,
      parameters: schema,
    } as ToolConfig<Static<T>, TDetails>;
    return builder;
  }

  /** Registers the async implementation invoked when the tool is executed. */
  execute(fn: (params: TParams, ctx: ToolExecutionContext) => Promise<ToolResult<TDetails>>): this {
    this.config.execute = fn;
    return this;
  }

  /** Finalizes the builder into a runtime tool definition. */
  build(): RuntimeTool<TSchema, TDetails> {
    if (!this.config.name) {
      throw new Error("Tool name is required");
    }
    if (!this.config.description) {
      throw new Error("Tool description is required");
    }
    if (!this.config.execute) {
      throw new Error("Tool execute function is required");
    }

    const parameters = this.config.parameters ?? Type.Object({});
    const executeFn = this.config.execute;

    return {
      name: this.config.name,
      label: this.config.label ?? this.config.name,
      description: this.config.description,
      parameters,
      execute: async (
        toolCallId: string,
        params: Static<typeof parameters>,
        signal?: AbortSignal,
        onUpdate?: (partialResult: ToolResult<TDetails>) => void,
        onSignal?: (event: ToolSignalEvent) => void,
      ): Promise<ToolResult<TDetails>> => {
        const ctx: ToolExecutionContext = {
          toolCallId,
          signal,
          onUpdate: onUpdate ?? (() => {}),
          onSignal,
        };
        return executeFn(params as TParams, ctx);
      },
    };
  }
}

// ============================================================================
// ============================================================================

/**
 * Starts a fluent tool definition.
 *
 * @example
 * ```ts
 * const greet = tool()
 *   .name("greet")
 *   .description("Greets a user by name.")
 *   .parameters(Type.Object({ name: Type.String() }))
 *   .execute(async ({ name }) => ({
 *     content: [{ type: "text", text: `Hello, ${name}!` }],
 *     details: null,
 *   }))
 *   .build();
 * ```
 */
export function tool(): ToolBuilder {
  return new ToolBuilder();
}

// ============================================================================
// ============================================================================

/**
 * Defines a tool that does not accept structured parameters.
 *
 * @example
 * ```ts
 * const now = defineSimpleTool({
 *   name: "current-time",
 *   description: "Returns the current UTC time.",
 *   execute: async () => ({
 *     content: [{ type: "text", text: new Date().toISOString() }],
 *     details: null,
 *   }),
 * });
 * ```
 */
export function defineSimpleTool<TDetails = unknown>(options: {
  /** Stable tool name exposed to the model. */
  name: string;
  /** Optional human-readable label used in logs and UI surfaces. */
  label?: string;
  /** Description shown to the model for tool selection. */
  description: string;
  /** Async implementation invoked when the tool is called. */
  execute: (ctx: ToolExecutionContext) => Promise<ToolResult<TDetails>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): RuntimeTool<TSchema, any> {
  return tool()
    .name(options.name)
    .label(options.label ?? options.name)
    .description(options.description)
    .execute(async (_params, ctx) => options.execute(ctx))
    .build();
}
