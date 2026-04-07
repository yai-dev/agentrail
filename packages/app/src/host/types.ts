/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SessionRef, TodoStorage } from "@agentrail/core";
import type { Agent, Message, Usage } from "@agentrail/core";

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
 * Register profiles with `createHostedProfileResolver` and pass the resolver
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

/**
 * Minimal storage surface the host runtime needs to load, persist, and compact
 * session history. The default file-backed SessionManager satisfies this shape.
 */
export interface AgentrailSessionStore {
  getOrCreate(
    tenantId: string,
    userId: string,
    agentId: string,
    sessionId?: string,
  ): Promise<{ sessionId: string; sessionRef: SessionRef }>;
  loadMessages(tenantId: string, sessionId: string, limit?: number): Promise<Message[]>;
  loadMessagesWithBudget(
    tenantId: string,
    sessionId: string,
    tokenBudget?: number,
  ): Promise<Message[]>;
  loadAllMessages(tenantId: string, sessionId: string): Promise<Message[]>;
  appendMessages(tenantId: string, sessionId: string, messages: Message[]): Promise<void>;
  recordTurn(tenantId: string, sessionId: string, usage: Usage): Promise<void>;
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
  createTodoStorage?(sessionRef: SessionRef): TodoStorage;
  persistSkillSubAgentLog?(
    sessionRef: SessionRef,
    entry: {
      skillName: string;
      task: string;
      input: string;
      systemPrompt: string;
      messages: unknown[];
      resultText: string;
      startedAt: number;
      finishedAt: number;
    },
  ): Promise<void>;
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
