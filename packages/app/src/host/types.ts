/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// Import for local use within this file AND re-export so that consumers can
// import from either @agentrail/app or @agentrail/core without getting
// structurally-incompatible types.
import type {
  Agent,
  AgentrailSessionStore,
  ContextProvider,
  ContextProviderContext,
  SessionRef,
  Usage,
} from "@agentrail/core";
export type { AgentrailSessionStore, ContextProvider, ContextProviderContext } from "@agentrail/core";

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
  getContextProviders?(context: AgentrailProfileContext): Promise<ContextProvider[]> | ContextProvider[];
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
 * 2. Per-request hooks run in declaration order:
 *    `interceptChatRequest` → `onRequestStart` → _(agent runs)_ → `onRequestEnd`
 *    → `onTurnPersisted`
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
