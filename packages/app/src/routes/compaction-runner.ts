/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Message } from "@agentrail/core";
import { runCompactionIfNeeded, type CompactionConfig } from "@/host/compaction.js";
import type { SummarizeMessagesFn } from "@/host/reactive-compaction.js";
import type { AgentrailSessionStore } from "@/host/types.js";

/**
 * Loads all session messages, runs compaction when thresholds are exceeded,
 * and returns the budget-limited history slice ready for agent invocation.
 *
 * The optional callbacks let callers emit SSE lifecycle events (stream route)
 * or take other side-effects without coupling this helper to transport details.
 */
export async function runCompactionStep(
  sessionStore: AgentrailSessionStore,
  tenantId: string,
  sessionId: string,
  summarize: SummarizeMessagesFn,
  compaction: CompactionConfig,
  opts?: {
    workspaceSnapshot?: string;
    onBeforeCompact?: () => Promise<void> | void;
    onAfterCompact?: () => Promise<void> | void;
  },
): Promise<Message[]> {
  const allMessages = await sessionStore.loadAllMessages(tenantId, sessionId);
  await runCompactionIfNeeded(sessionStore, tenantId, sessionId, allMessages, summarize, compaction, opts);
  return sessionStore.loadMessagesWithBudget(tenantId, sessionId);
}
