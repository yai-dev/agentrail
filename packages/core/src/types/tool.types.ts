/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Static, TSchema } from "@sinclair/typebox";
import type { ImageContent, TextContent } from "@/types/content.types.js";

/** Schema-only description of a tool that can be exposed to a model. */
export interface ToolDefinition<TParameters extends TSchema = TSchema> {
  /** Stable tool name referenced in tool calls. */
  name: string;
  /** Instruction shown to the model when choosing tools. */
  description: string;
  /** TypeBox schema describing the accepted tool arguments. */
  parameters: TParameters;
}

/** Structured result returned by a tool execution. */
export interface ToolResult<TDetails = unknown> {
  /** Model-visible content appended as a `toolResult` message. */
  readonly content: (TextContent | ImageContent)[];
  /** Opaque machine-friendly details for callers that need richer metadata. */
  readonly details: TDetails;
}

/** Callback used to stream a partial tool result before execution finishes. */
export type ToolUpdateCallback<TDetails = unknown> = (partialResult: ToolResult<TDetails>) => void;

/** Out-of-band signal emitted by a running tool. */
export type ToolSignalEvent = {
  /** Signal type emitted when the tool needs human input to continue. */
  readonly type: "waiting_for_input";
  /** Prompt shown to the user. */
  readonly question: string;
  /** Optional hint that clarifies expected input. */
  readonly hint?: string;
  /** Optional predefined choices. */
  readonly options?: string[];
  /** Whether multiple options may be selected. */
  readonly multiple?: boolean;
  /** Whether custom free-form input is allowed. */
  readonly custom?: boolean;
};

/** Full runtime representation of an executable tool. */
export interface RuntimeTool<
  TParameters extends TSchema = TSchema,
  TDetails = unknown,
> extends ToolDefinition<TParameters> {
  /** Human-readable label used in logs and developer tooling. */
  label: string;

  /** Executes the tool for a single model-generated tool call. */
  execute(
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: ToolUpdateCallback<TDetails>,
    onSignal?: (event: ToolSignalEvent) => void,
  ): Promise<ToolResult<TDetails>>;
}

/** Extracts the static parameter type from a runtime tool definition. */
export type ExtractToolParams<T> = T extends RuntimeTool<infer P, unknown> ? Static<P> : never;

/** Extracts the opaque `details` payload type from a runtime tool definition. */
export type ExtractToolDetails<T> = T extends RuntimeTool<TSchema, infer D> ? D : never;
