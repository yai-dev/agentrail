/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// Import for local use within this file AND re-export so that consumers can
// import from either @agentrail/app or @agentrail/core without getting
// structurally-incompatible types.
import type { ToolPermissionPolicy } from "@agentrail/capabilities";
import type {
  Agent,
  AgentrailSessionStore,
  ContextProvider,
  SessionRef,
  TransformContextFn,
  Usage,
} from "@agentrail/core";
export type {
  AgentrailSessionStore,
  ContextProvider,
  ContextProviderContext,
} from "@agentrail/core";

// ============================================================================
// Plugin error reporting
// ============================================================================

/**
 * Contextual information passed to `onPluginError` when a plugin hook throws.
 */
export interface PluginErrorContext {
  /** The `name` of the plugin that threw. */
  plugin: string;
  /** The hook that was executing, e.g. `"interceptChatRequest"` or `"onRequestStart"`. */
  hook: string;
  /** The original error thrown by the plugin hook. */
  error: unknown;
}

/**
 * Callback invoked whenever a plugin hook throws an error that has been
 * isolated by the host runtime.
 *
 * The callback may be synchronous or asynchronous — the host `await`s its
 * result before deciding whether to continue or rethrow. If the callback
 * itself throws, the host catches and falls back to `console.error`; the
 * main request flow is never affected by callback instability.
 *
 * ### Usage
 * ```ts
 * const onPluginError: PluginErrorHandler = async ({ plugin, hook, error }) => {
 *   await myLogger.warn({ plugin, hook, err: error }, "plugin hook failed");
 * };
 *
 * // Thread the same handler into both lifecycle calls and createAgentApp.
 * void runPluginLifecycle(plugins, "start", onPluginError);
 * createAgentApp({ ..., onPluginError });
 * ```
 */
export type PluginErrorHandler = (ctx: PluginErrorContext) => void | Promise<void>;

/**
 * Context passed to a hosted profile when constructing a runtime agent.
 *
 * @see {@link https://agentrail.run/reference/profile-contract}
 */
export interface AgentrailProfileContext {
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionRef: SessionRef;
  sessionStore: AgentrailSessionStore;
  /**
   * Stable correlation ID for the entire request chain.  When present, this is
   * propagated into `CapabilityBuildContext.tracing.chainId` and then into
   * `AgentRunOptions.chainId` so that `RuntimeEvent.chainId` equals the
   * route-level `traceId`/`requestTraceId`.
   */
  chainId?: string;
  /**
   * Active permission policy for this session.  When present, all file and
   * shell tools — both sandboxed (Bash, Read, Write, Edit) and non-sandboxed
   * — evaluate it via `checkPermissions` before executing.
   */
  permissionPolicy?: ToolPermissionPolicy;
}

/**
 * Low-level profile contract consumed by the host runtime.
 *
 * Register profiles with `createProfileResolver` and pass the resolver
 * to `createChatRoute` or `createStreamRoute`.
 *
 * @see {@link https://agentrail.run/concepts/profiles}
 * @see {@link https://agentrail.run/reference/profile-contract}
 */
export interface AgentrailProfile {
  id: string;
  name: string;
  /** Context window size in tokens for the model used by this profile. Defaults to 200_000. */
  contextWindow?: number;
  createAgent(
    context: AgentrailProfileContext,
    onSubAgentEvent?: (event: object) => void,
  ): Promise<Agent>;
  /**
   * Returns capability-level context providers for this request.
   * Populated automatically by `createAgentApp` when the profile declares
   * `capabilities` via `defineProfile`. Route handlers call this after
   * `createAgent` and merge the result with the static `contextProviders`.
   */
  getContextProviders?(
    context: AgentrailProfileContext,
  ): Promise<ContextProvider[]> | ContextProvider[];
  /**
   * Returns a request-scoped full-message transform for rewrite-style context logic.
   * This runs before context providers so injected messages see the rewritten history.
   */
  getTransformContext?(
    context: AgentrailProfileContext,
  ): Promise<TransformContextFn> | TransformContextFn;
}

/** JSON request body accepted by the non-streaming chat route. */
export interface AgentrailChatRequest {
  message: string;
  agentId?: string;
  mode?: string;
  tenantId: string;
  userId: string;
  sessionId?: string;
}

/** Structured early-return response from a request interceptor or plugin. */
export interface AgentrailChatHandledResponse {
  status?: 200 | 201 | 202 | 400 | 401 | 403 | 404 | 409 | 422 | 500;
  body: Record<string, unknown>;
}

/** Context passed to chat-request interceptors before the agent runs. */
export interface AgentrailChatRequestContext {
  kind: "chat";
  request: AgentrailChatRequest;
  agentId: string;
  signal: AbortSignal;
}

/** Fully resolved context for a chat request after session lookup. */
export interface AgentrailResolvedChatContext {
  request: AgentrailChatRequest;
  agentId: string;
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionRef: SessionRef;
  signal: AbortSignal;
  sessionStore: AgentrailSessionStore;
}

/** Successful JSON payload returned by `createChatRoute`. */
export interface AgentrailChatSuccessBody {
  sessionId: string | null;
  text: string;
  usage: Pick<Usage, "inputTokens" | "outputTokens"> | Usage;
  stopReason: string;
}

/** Lifecycle hook context shared across chat and stream routes. */
export interface AgentrailRequestLifecycleContext {
  kind: "chat" | "stream";
  tenantId: string;
  userId: string;
  sessionId: string;
  agentId: string;
}

// ============================================================================
// Tool call hook types
// ============================================================================

/**
 * App-layer result type for `onBeforeToolCall`.
 *
 * This is the **app-level** variant where a replacement `input` is typed as
 * `Record<string, unknown>` (matching the structured tool parameter convention).
 * It is a strict subtype of the core `BeforeToolCallResult` and is safely
 * up-cast inside `buildToolInterceptor` without runtime validation.
 */
export type AppBeforeToolCallResult =
  | { readonly action: "allow" }
  | { readonly action: "deny"; readonly reason: string }
  | { readonly action: "allow"; readonly input: Record<string, unknown> };

/**
 * Event passed to `AgentrailPlugin.onBeforeToolCall`.
 *
 * **Object-only contract**: the app layer only dispatches `onBeforeToolCall` when
 * the validated tool input is a plain, non-array object.  Tools whose top-level
 * schema is an array or primitive will silently skip all `onBeforeToolCall` hooks
 * via `buildToolInterceptor`.  This matches the `Record<string, unknown>` type of
 * `input` — hooks are not called for schemas that cannot safely be represented as
 * a record.
 */
export interface BeforeToolCallEvent {
  /** Name of the tool being invoked. */
  readonly toolName: string;
  /**
   * Fresh shallow copy of the validated tool arguments for this plugin call.
   * Returning `{ action: "allow", input: { ...modified } }` propagates the
   * modified input to subsequent plugins and to the actual tool execution.
   * In-place mutations to this object do **not** affect other plugins.
   */
  readonly input: Record<string, unknown>;
  /** Identity and session information for the current request. */
  readonly context: AgentrailProfileContext;
}

/**
 * Event passed to `AgentrailPlugin.onAfterToolCall`.
 *
 * Like `BeforeToolCallEvent`, this event is only dispatched for tools whose
 * validated input is a plain object.  Array- and primitive-typed tools skip
 * `onAfterToolCall` hooks silently.
 */
export interface AfterToolCallEvent {
  /** Name of the tool that was invoked. */
  readonly toolName: string;
  /**
   * Fresh shallow copy of the effective input that was passed to the tool
   * (after any `onBeforeToolCall` modifications).  In-place mutations do
   * **not** affect other plugins.
   */
  readonly input: Record<string, unknown>;
  /** The result produced by the tool. */
  readonly result: unknown;
  /** Wall-clock duration of the tool's `execute()` call in milliseconds. */
  readonly durationMs: number;
  /** Identity and session information for the current request. */
  readonly context: AgentrailProfileContext;
}

/**
 * Lightweight host extension contract for request interception and lifecycle hooks.
 *
 * A plugin is a named, optionally versioned object that the host mounts at startup.
 * Plugins can intercept incoming requests, supply context providers to every agent
 * call, handle file attachments, and observe request/turn lifecycle events.
 *
 * ### Lifecycle
 * 1. `start()` — called once when `createAgentApp` initialises. Use to open
 *    connections or warm up caches.
 * 2. Per-request hooks run in priority order:
 *    `interceptChatRequest` → `onRequestStart` → _(agent runs)_
 *    → per tool: `onBeforeToolCall` → _(tool executes)_ → `onAfterToolCall`
 *    → `onTurnPersisted` → `onRequestEnd`
 * 3. `stop()` — called on graceful shutdown. Use to flush buffers and close
 *    connections.
 *
 * @see {@link https://agentrail.run/reference/plugin-contract}
 */
export interface AgentrailPlugin {
  /** Human-readable plugin identifier used in logs and error messages. */
  name: string;

  /**
   * Semantic version string (`MAJOR.MINOR.PATCH`) of the plugin implementation.
   * Providing a version is strongly recommended for diagnostics and compatibility
   * checks — e.g. `"1.0.0"`.
   */
  version?: string;

  /**
   * Execution order for this plugin relative to others.
   *
   * Higher values run **first** during `start()` and all request-time hooks.
   * `stop()` runs in the **reverse** order (lowest priority stops first),
   * mirroring standard dependency teardown semantics.
   *
   * Defaults to `0`. Plugins with equal priority run in registration order.
   *
   * @example
   * ```ts
   * // Auth plugin must intercept before any feature plugin
   * const authPlugin: AgentrailPlugin = { name: "auth", priority: 100, ... };
   * const featurePlugin: AgentrailPlugin = { name: "feature", priority: 0, ... };
   * ```
   */
  priority?: number;

  /**
   * When `true`, an error thrown by `interceptChatRequest` is treated as a
   * deliberate denial and propagates to abort the request (after being reported
   * to `onPluginError`).
   *
   * Use this for auth, rate-limit, or policy plugins where a throw means
   * "deny this request". Non-critical plugin errors are isolated — the request
   * continues as if the plugin returned `null`.
   *
   * Defaults to `false`.
   */
  critical?: boolean;

  /**
   * Initialise the plugin. Called once when the host application starts.
   * Throw to abort startup with a descriptive error.
   */
  start?(): void | Promise<void>;

  /**
   * Tear down the plugin. Called on graceful host shutdown.
   * Errors thrown here are logged but do not prevent other plugins from stopping.
   */
  stop?(): void | Promise<void>;

  /**
   * Intercept an incoming chat request before the agent runs.
   * Return a non-null `AgentrailChatHandledResponse` to short-circuit execution
   * (e.g. for rate limiting or cached replies). Return `null` to continue.
   */
  interceptChatRequest?(
    context: AgentrailChatRequestContext,
  ): Promise<AgentrailChatHandledResponse | null> | AgentrailChatHandledResponse | null;

  /**
   * Additional context providers contributed by this plugin. They are merged
   * with profile-level providers and called before each agent turn.
   */
  contextProviders?: ContextProvider[];

  /**
   * Optional handler that converts uploaded file attachments into additional
   * agent context text. Called after request validation, before agent execution.
   */
  attachmentHandler?: AttachmentHandler;

  /**
   * Called at the very start of each chat or stream request, before the agent
   * begins processing. Useful for emitting metrics or opening per-request spans.
   */
  onRequestStart?(context: AgentrailRequestLifecycleContext): void | Promise<void>;

  /**
   * Called after the agent finishes and the response is fully sent.
   * Errors thrown here are logged but do not affect the HTTP response.
   */
  onRequestEnd?(context: AgentrailRequestLifecycleContext): void | Promise<void>;

  /**
   * Called after the turn's messages have been persisted to the session store.
   * Use for post-turn side effects such as triggering memory consolidation.
   */
  onTurnPersisted?(context: AgentrailRequestLifecycleContext): void | Promise<void>;

  /**
   * Called just before a tool's `execute()` is invoked.
   *
   * Return `{ action: "allow" }` to proceed unchanged, `{ action: "allow", input }` to
   * replace the arguments passed to the tool, or `{ action: "deny", reason }` to abort
   * the tool call and surface an error to the model.
   *
   * If this hook throws, the error is reported via `onPluginError` and execution
   * continues as if the hook returned `{ action: "allow" }` (i.e. a throw is **not**
   * treated as a deny).
   */
  onBeforeToolCall?(
    event: BeforeToolCallEvent,
  ): Promise<AppBeforeToolCallResult> | AppBeforeToolCallResult;

  /**
   * Called after a tool completes (both successful runs and execution errors).
   * Not called when execution was blocked by a `deny` result.
   *
   * Errors thrown here are reported via `onPluginError` and do not affect the
   * tool result returned to the model.
   */
  onAfterToolCall?(event: AfterToolCallEvent): Promise<void> | void;
}

/** Uploaded attachment metadata made available to attachment handlers. */
export interface AttachmentFile {
  name: string;
  mimeType: string;
  containerPath: string;
  sizeKb: number;
}

/** Additional context produced from uploaded files. */
export interface AttachmentHandlerResult {
  contextText?: string;
}

/** Converts uploaded files into extra request context before agent execution. */
export type AttachmentHandler = (
  files: AttachmentFile[],
) => Promise<AttachmentHandlerResult | null> | AttachmentHandlerResult | null;
