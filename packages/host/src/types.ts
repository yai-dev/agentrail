/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Agent, Message, Usage } from "@agentrail/runtime-core";

export interface AgentrailProfileContext {
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionDir: string;
}

/** Low-level profile contract consumed by the host runtime. */
export interface AgentrailProfile {
  id: string;
  name: string;
  createAgent(
    context: AgentrailProfileContext,
    onSubAgentEvent?: (event: object) => void,
  ): Promise<Agent>;
}

export interface AgentrailChatRequest {
  message: string;
  agentId?: string;
  mode?: string;
  tenantId: string;
  userId: string;
  sessionId?: string;
}

export interface AgentrailChatHandledResponse {
  status?: 200 | 201 | 202 | 400 | 401 | 403 | 404 | 409 | 422 | 500;
  body: Record<string, unknown>;
}

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
  ): Promise<{ sessionId: string }>;
  getSessionDir(tenantId: string, sessionId: string): string;
  loadMessages(
    tenantId: string,
    sessionId: string,
    limit?: number,
  ): Promise<Message[]>;
  loadMessagesWithBudget(
    tenantId: string,
    sessionId: string,
    tokenBudget?: number,
  ): Promise<Message[]>;
  loadAllMessages(tenantId: string, sessionId: string): Promise<Message[]>;
  appendMessages(
    tenantId: string,
    sessionId: string,
    messages: Message[],
  ): Promise<void>;
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
}

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

export interface AgentrailChatSuccessBody {
  sessionId: string | null;
  text: string;
  usage: Pick<Usage, "inputTokens" | "outputTokens"> | Usage;
  stopReason: string;
}

export interface ContextProviderContext {
  tenantId: string;
  userId: string;
  sessionId: string;
}

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
  onRequestStart?(
    context: AgentrailRequestLifecycleContext,
  ): void | Promise<void>;
  onRequestEnd?(
    context: AgentrailRequestLifecycleContext,
  ): void | Promise<void>;
  onTurnPersisted?(
    context: AgentrailRequestLifecycleContext,
  ): void | Promise<void>;
}

export interface AttachmentFile {
  name: string;
  mimeType: string;
  containerPath: string;
  sizeKb: number;
}

export interface AttachmentHandlerResult {
  contextText?: string;
}

export type AttachmentHandler = (
  files: AttachmentFile[],
) => Promise<AttachmentHandlerResult | null> | AttachmentHandlerResult | null;
