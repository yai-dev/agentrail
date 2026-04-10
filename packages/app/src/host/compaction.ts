/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { ReactiveCompactionConfig, SummarizeMessagesFn } from "@/host/reactive-compaction.js";
import type { AgentrailSessionStore } from "@/host/types.js";
import { estimateMessageTokens } from "@/session/token-estimator.js";
import type { Message } from "@agentrail/core";
export type {
  CompactionSummaryContext,
  ReactiveCompactionConfig,
  SummarizeMessagesFn,
} from "@/host/reactive-compaction.js";

/** Token thresholds that control when host-side history compaction runs. */
export interface CompactionConfig {
  triggerTokens: number;
  minMessages: number;
  reactive?: ReactiveCompactionConfig;
}

/**
 * Runs context compaction when the session history exceeds the configured
 * token threshold. Returns true if compaction was performed.
 *
 * The optional `onBeforeCompact` / `onAfterCompact` hooks let callers inject
 * side-effects (e.g. SSE event emission in the stream route) without leaking
 * route-specific logic into this helper.
 */
export async function runCompactionIfNeeded(
  sessionStore: AgentrailSessionStore,
  tenantId: string,
  sessionId: string,
  allMessages: Message[],
  summarize: SummarizeMessagesFn,
  compaction: CompactionConfig,
  opts?: {
    workspaceSnapshot?: string;
    onBeforeCompact?: () => Promise<void> | void;
    onAfterCompact?: () => Promise<void> | void;
  },
): Promise<boolean> {
  if (
    allMessages.length < compaction.minMessages ||
    estimateMessageTokens(allMessages) <= compaction.triggerTokens
  ) {
    return false;
  }

  await opts?.onBeforeCompact?.();
  const result = await sessionStore.compactIfNeeded(
    tenantId,
    sessionId,
    (messages) => summarize(messages, { reason: "session_compaction" }),
    {
      preloadedMessages: allMessages,
      triggerTokens: compaction.triggerTokens,
      workspaceSnapshot: opts?.workspaceSnapshot,
    },
  );
  await opts?.onAfterCompact?.();

  return result;
}
