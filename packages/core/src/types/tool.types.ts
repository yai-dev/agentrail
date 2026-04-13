/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { ImageContent, TextContent } from "@/types/content.types.js";
import type { Static, TSchema } from "@sinclair/typebox";

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

/**
 * The outcome of a `checkPermissions` call.
 *
 * - `"allow"` — execution may proceed.
 * - `"deny"` — execution is blocked; the model receives an error result.
 * - `"ask"` — execution requires user approval. When a
 *   `PermissionApprovalHandler` is available, the executor emits a
 *   `permission_request` RuntimeEvent and then **suspends** the tool call
 *   until the handler resolves. The handler's response determines whether
 *   execution proceeds (`"approved"`) or the call receives an error result
 *   (`"rejected"`). Without a handler the call is denied immediately.
 *
 * The object form allows attaching an optional human-readable `reason` that
 * is surfaced in the error result and the `permission_request` event.
 */
export type PermissionDecision =
  | "allow"
  | "deny"
  | "ask"
  | { readonly decision: "allow" | "deny" | "ask"; readonly reason?: string };

/**
 * Host-provided callback that resolves a `"ask"` permission decision
 * interactively instead of denying it immediately.
 *
 * Implementations should suspend the call until the user approves or rejects,
 * then resolve with `"approved"` or `"rejected"`.
 */
export interface PermissionApprovalHandler {
  requestApproval(input: {
    toolCallId: string;
    toolName: string;
    reason?: string;
    signal?: AbortSignal;
  }): Promise<"approved" | "rejected">;
}

/** Full runtime representation of an executable tool. */
export interface RuntimeTool<
  TParameters extends TSchema = TSchema,
  TDetails = unknown,
> extends ToolDefinition<TParameters> {
  /** Human-readable label used in logs and developer tooling. */
  label: string;

  /**
   * Optional permission check invoked after `onBeforeToolCall` and before
   * `validate`.
   *
   * The function receives the effective (post-interceptor) arguments and
   * returns a `PermissionDecision`:
   * - `"allow"` — proceed to `validate` / `execute`.
   * - `"deny"` — block execution; model receives an error result.
   * - `"ask"` — emit a `permission_request` RuntimeEvent then block
   *   (non-interactive until the host wires up an approval mechanism).
   *
   * `onAfterToolCall` is **not** called for permission-denied executions.
   */
  checkPermissions?(params: unknown): Promise<PermissionDecision> | PermissionDecision;

  /**
   * Optional business-logic precondition check.
   *
   * Called after TypeBox schema validation and after any `onBeforeToolCall`
   * interceptor has potentially rewritten the arguments, but before `execute`.
   * If this method returns `{ valid: false }` or throws, `execute` is not
   * called and the model receives a `"Tool precondition failed: <reason>"`
   * error result. `onAfterToolCall` is also not called in that case.
   */
  validate?(
    params: Static<TParameters>,
    ctx: ToolValidationContext,
  ): Promise<ValidationResult> | ValidationResult;

  /** Executes the tool for a single model-generated tool call. */
  execute(
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: ToolUpdateCallback<TDetails>,
    onSignal?: (event: ToolSignalEvent) => void,
  ): Promise<ToolResult<TDetails>>;
}

// ============================================================================
// Validation types — two-phase validation support
// ============================================================================

/**
 * Minimal context available to a tool's `validate` method.
 *
 * Intentionally narrower than `ToolExecutionContext`: validation is a pure
 * precondition check and does not need streaming callbacks.
 */
export interface ToolValidationContext {
  readonly toolCallId: string;
  readonly signal?: AbortSignal;
}

/**
 * Return value of a `validate` method.
 *
 * - `{ valid: true }` — precondition satisfied, proceed to execution.
 * - `{ valid: false; reason: string }` — precondition failed; the executor
 *   surfaces the reason as a `"Tool precondition failed: <reason>"` error result.
 */
export type ValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string };

/** Extracts the static parameter type from a runtime tool definition. */
export type ExtractToolParams<T> = T extends RuntimeTool<infer P, unknown> ? Static<P> : never;

/** Extracts the opaque `details` payload type from a runtime tool definition. */
export type ExtractToolDetails<T> = T extends RuntimeTool<TSchema, infer D> ? D : never;

// ============================================================================
// ToolInterceptor — pre/post hook contract for the core agent loop
// ============================================================================

/**
 * Result returned by `ToolInterceptor.onBeforeToolCall`.
 *
 * - `{ action: "allow" }` — proceed with the original (or previously modified) input.
 * - `{ action: "allow"; input: unknown }` — proceed with a replacement input value.
 * - `{ action: "deny"; reason: string }` — abort execution and surface an error to the model.
 */
export type BeforeToolCallResult =
  | { readonly action: "allow" }
  | { readonly action: "deny"; readonly reason: string }
  | { readonly action: "allow"; readonly input: unknown };

/** Context passed to `ToolInterceptor.onBeforeToolCall`. */
export interface ToolInterceptorBeforeContext {
  readonly toolName: string;
  /**
   * The validated arguments that will be passed to the tool.
   *
   * The core executor does not clone this value — it is passed by reference.
   * Host-layer composers (e.g. `buildToolInterceptor`) are responsible for
   * any defensive copying they wish to do between plugin calls.
   */
  readonly input: unknown;
}

/** Context passed to `ToolInterceptor.onAfterToolCall`. */
export interface ToolInterceptorAfterContext {
  readonly toolName: string;
  /** The effective input that was passed to the tool (after any before-hook modifications). */
  readonly input: unknown;
  readonly result: unknown;
  readonly durationMs: number;
}

/**
 * Generic pre/post interception contract consumed by `executeToolCalls`.
 *
 * The core executor calls exactly one `onBeforeToolCall` and one `onAfterToolCall`
 * per tool execution.  Multi-plugin composition, priority ordering, and error
 * isolation (safeNotify) are the responsibility of the host layer that builds
 * and supplies this object.
 *
 * Error semantics:
 * - If either hook throws, the error propagates uncaught from the executor.
 *   The host layer is responsible for ensuring the interceptor does not throw.
 * - `onAfterToolCall` is not called when a before-hook returns `{ action: "deny" }`.
 */
export interface ToolInterceptor {
  onBeforeToolCall?(
    ctx: ToolInterceptorBeforeContext,
  ): Promise<BeforeToolCallResult> | BeforeToolCallResult;
  onAfterToolCall?(ctx: ToolInterceptorAfterContext): Promise<void> | void;
}
