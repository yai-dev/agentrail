/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Agent, Message, Usage } from "@agentrail/runtime-core";

/**
 * Context passed to a hosted profile when constructing a runtime agent.
 *
 * @see {@link https://agentrail.run/reference/profile-contract}
 */
export interface AgentrailProfileContext {
  /** Tenant identifier for the active request. */
  tenantId: string;
  /** End-user identifier within the tenant. */
  userId: string;
  /** Session identifier resolved or created for the request. */
  sessionId: string;
  /** Absolute path to the session directory on disk. */
  sessionDir: string;
}

/**
 * Low-level profile contract consumed by the host runtime.
 *
 * Register profiles with `createHostedProfileResolver` and pass the resolver
 * to `createChatRoute` or `createStreamRoute`.
 *
 * @see {@link https://agentrail.run/concepts/profiles}
 * @see {@link https://agentrail.run/reference/profile-contract}
 */
export interface AgentrailProfile {
  /** Unique identifier matched against incoming `agentId` values. */
  id: string;
  /** Human-readable display name used in logs and UI surfaces. */
  name: string;
  /** Context window size in tokens for the model used by this profile. Defaults to 200_000. */
  contextWindow?: number;
  /** Creates a runtime agent for one request lifecycle. */
  createAgent(
    context: AgentrailProfileContext,
    onSubAgentEvent?: (event: object) => void,
  ): Promise<Agent>;
}

/** JSON request body accepted by the non-streaming chat route. */
export interface AgentrailChatRequest {
  /** End-user message text sent to the agent. */
  message: string;
  /** Optional profile override; defaults to the route's configured profile. */
  agentId?: string;
  /** Optional application-defined mode switch. */
  mode?: string;
  /** Tenant identifier used to partition session storage. */
  tenantId: string;
  /** End-user identifier used to group sessions. */
  userId: string;
  /** Existing session to continue; omitted to create a new one. */
  sessionId?: string;
}

/** Structured early-return response from a request interceptor or plugin. */
export interface AgentrailChatHandledResponse {
  /** Optional explicit HTTP status code for the handled response. */
  status?: 200 | 201 | 202 | 400 | 401 | 403 | 404 | 409 | 422 | 500;
  /** JSON body returned to the caller as-is. */
  body: Record<string, unknown>;
}

/** Context passed to chat-request interceptors before the agent runs. */
export interface AgentrailChatRequestContext {
  /** Discriminator for chat-route interceptors. */
  kind: "chat";
  /** Parsed incoming request body. */
  request: AgentrailChatRequest;
  /** Resolved agent ID for the request. */
  agentId: string;
  /** Abort signal tied to the incoming HTTP connection. */
  signal: AbortSignal;
}

/**
 * Minimal storage surface the host runtime needs to load, persist, and compact
 * session history. The default file-backed SessionManager satisfies this shape.
 */
export interface AgentrailSessionStore {
  /** Looks up or creates the session backing the current request. */
  getOrCreate(
    tenantId: string,
    userId: string,
    agentId: string,
    sessionId?: string,
  ): Promise<{ sessionId: string }>;
  /** Returns the absolute directory path for a session. */
  getSessionDir(tenantId: string, sessionId: string): string;
  /** Loads the most recent messages up to an optional count limit. */
  loadMessages(tenantId: string, sessionId: string, limit?: number): Promise<Message[]>;
  /** Loads as much history as fits within the supplied token budget. */
  loadMessagesWithBudget(
    tenantId: string,
    sessionId: string,
    tokenBudget?: number,
  ): Promise<Message[]>;
  /** Loads the full persisted message history for a session. */
  loadAllMessages(tenantId: string, sessionId: string): Promise<Message[]>;
  /** Appends newly produced messages to the session history. */
  appendMessages(tenantId: string, sessionId: string, messages: Message[]): Promise<void>;
  /** Persists usage for the completed assistant turn. */
  recordTurn(tenantId: string, sessionId: string, usage: Usage): Promise<void>;
  /** Compacts session history when it exceeds configured thresholds. */
  compactIfNeeded(
    tenantId: string,
    sessionId: string,
    summarizeFn: (messages: Message[]) => Promise<string>,
    options?: {
      triggerTokens?: number;
      compactFraction?: number;
      preloadedMessages?: Message[];
      workspaceSnapshot?: string;
    },
  ): Promise<boolean>;
}

/** Fully resolved context for a chat request after session lookup. */
export interface AgentrailResolvedChatContext {
  request: AgentrailChatRequest;
  agentId: string;
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionDir: string;
  signal: AbortSignal;
  sessionStore: AgentrailSessionStore;
}

/** Successful JSON payload returned by `createChatRoute`. */
export interface AgentrailChatSuccessBody {
  /** Session ID associated with the request, or `null` if not persisted. */
  sessionId: string | null;
  /** Final assistant text extracted from the agent result. */
  text: string;
  /** Usage summary for the completed turn. */
  usage: Pick<Usage, "inputTokens" | "outputTokens"> | Usage;
  /** Final stop reason reported by the runtime. */
  stopReason: string;
}

/** Minimal context passed to context providers during message assembly. */
export interface ContextProviderContext {
  tenantId: string;
  userId: string;
  sessionId: string;
}

/** Lifecycle hook context shared across chat and stream routes. */
export interface AgentrailRequestLifecycleContext {
  kind: "chat" | "stream";
  tenantId: string;
  userId: string;
  sessionId: string;
  agentId: string;
}

/** Supplies additional messages that should be prepended before runtime history. */
export type ContextProvider = (
  context: ContextProviderContext,
  messages: Message[],
) => Promise<Message[]> | Message[];

/** Lightweight host extension contract for request interception and lifecycle hooks. */
export interface AgentrailPlugin {
  name: string;
  start?(): void | Promise<void>;
  stop?(): void | Promise<void>;
  interceptChatRequest?(
    context: AgentrailChatRequestContext,
  ): Promise<AgentrailChatHandledResponse | null> | AgentrailChatHandledResponse | null;
  contextProviders?: ContextProvider[];
  attachmentHandler?: AttachmentHandler;
  onRequestStart?(context: AgentrailRequestLifecycleContext): void | Promise<void>;
  onRequestEnd?(context: AgentrailRequestLifecycleContext): void | Promise<void>;
  onTurnPersisted?(context: AgentrailRequestLifecycleContext): void | Promise<void>;
}

/** Uploaded attachment metadata made available to attachment handlers. */
export interface AttachmentFile {
  /** Original file name supplied by the client. */
  name: string;
  /** MIME type inferred or provided for the file. */
  mimeType: string;
  /** Absolute path inside the sandbox container. */
  containerPath: string;
  /** File size in kilobytes for prompt budgeting. */
  sizeKb: number;
}

/** Additional context produced from uploaded files. */
export interface AttachmentHandlerResult {
  /** Optional text appended to the effective user message. */
  contextText?: string;
}

/** Converts uploaded files into extra request context before agent execution. */
export type AttachmentHandler = (
  files: AttachmentFile[],
) => Promise<AttachmentHandlerResult | null> | AttachmentHandlerResult | null;
