/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SessionRef } from "@/session/session-ref.js";
import type { TodoStorage } from "@/session/todo-storage.js";
import type { Message } from "@/types/message.types.js";
import type { Usage } from "@/types/usage.types.js";

/**
 * Minimal storage surface the host runtime needs to load, persist, and compact
 * session history. The default file-backed `SessionManager` satisfies this shape,
 * and any custom implementation must implement every non-optional method.
 *
 * ### Responsibilities
 * - **Identity** — create or retrieve a session keyed by `(tenantId, userId, agentId)`.
 * - **Message I/O** — load historical messages with optional token-budget capping, and
 *   append new messages after each agent turn.
 * - **Usage tracking** — record per-turn token usage for billing / analytics.
 * - **Compaction** — optionally summarise old messages when the context window fills up.
 * - **Extensions** — optional hooks for TODO storage and skill sub-agent logging.
 *
 * @see {@link https://agentrail.run/reference/session-store}
 */
export interface AgentrailSessionStore {
  /**
   * Retrieve an existing session or create a new one.
   * Returns the canonical `sessionId` and a `SessionRef` opaque handle used by
   * other methods on this interface.
   */
  getOrCreate(
    tenantId: string,
    userId: string,
    agentId: string,
    sessionId?: string,
  ): Promise<{ sessionId: string; sessionRef: SessionRef }>;

  /**
   * Load the most recent `limit` messages for a session.
   * If `limit` is omitted the implementation may return all messages.
   */
  loadMessages(tenantId: string, sessionId: string, limit?: number): Promise<Message[]>;

  /**
   * Load messages up to a token budget.
   * The implementation should return as many recent messages as possible without
   * exceeding `tokenBudget` tokens (counted by the store's tokeniser).
   */
  loadMessagesWithBudget(
    tenantId: string,
    sessionId: string,
    tokenBudget?: number,
  ): Promise<Message[]>;

  /** Load every message in the session without any limit or budget cap. */
  loadAllMessages(tenantId: string, sessionId: string): Promise<Message[]>;

  /** Persist one or more new messages produced during an agent turn. */
  appendMessages(tenantId: string, sessionId: string, messages: Message[]): Promise<void>;

  /** Record aggregate token usage for the completed turn. */
  recordTurn(tenantId: string, sessionId: string, usage: Usage): Promise<void>;

  /**
   * Summarise old messages if the session has grown beyond the configured threshold.
   * Returns `true` when compaction actually ran, `false` when the threshold was
   * not reached.
   *
   * @param summarizeFn - Agent-powered summarisation callback provided by the runtime.
   * @param options.triggerTokens - Token count above which compaction triggers.
   * @param options.compactFraction - Fraction of oldest messages to summarise (0–1).
   * @param options.preloadedMessages - Already-loaded messages to avoid a redundant read.
   * @param options.workspaceSnapshot - Optional serialised workspace state to include.
   */
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

  /**
   * Health probe for readiness checks.
   * Implementations should attempt a lightweight operation (e.g. a filesystem
   * stat or a DB ping) and resolve when healthy, or reject when not.
   * Optional — when absent, the built-in readiness check skips this store.
   */
  ping?(): Promise<void>;

  /**
   * Return a `TodoStorage` scoped to this session.
   * Optional — omit if your store does not support structured task lists.
   */
  createTodoStorage?(sessionRef: SessionRef): TodoStorage;

  /**
   * Persist a skill sub-agent execution log entry.
   * Optional — omit if skill-level tracing is not needed.
   */
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
