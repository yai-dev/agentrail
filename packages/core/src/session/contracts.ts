/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Message } from "@/types/message.types.js";
import type { Usage } from "@/types/usage.types.js";
import type { SessionRef } from "@/session/session-ref.js";
import type { TodoStorage } from "@/session/todo-storage.js";

/**
 * Minimal storage surface the host runtime needs to load, persist, and compact
 * session history. The default file-backed SessionManager satisfies this shape.
 *
 * @see {@link https://agentrail.run/reference/session-store}
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

/** Minimal context passed to context providers during message assembly. */
export interface ContextProviderContext {
  tenantId: string;
  userId: string;
  sessionId: string;
}

/** Supplies additional messages that should be prepended before conversation history. */
export type ContextProvider = (
  context: ContextProviderContext,
  messages: Message[],
) => Promise<Message[]> | Message[];
