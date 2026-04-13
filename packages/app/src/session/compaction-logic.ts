/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { estimateMessageTokens } from "@/session/token-estimator.js";
import type { Message } from "@agentrail/core";

/**
 * Pure computation: decide which messages to compact and which to keep.
 *
 * Returns `null` when compaction should not run (too few messages or below the
 * token threshold and `force` is false).  Otherwise returns:
 * - `toCompact` — the oldest slice that will be summarised
 * - `toKeep`    — the recent slice that stays in the visible context
 * - `totalTokens` — estimated token count of the full message list
 *
 * No I/O is performed; all decisions are based on the provided `all` array.
 */
export function computeCompactionSplit(
  all: Message[],
  options: {
    triggerTokens?: number;
    compactFraction?: number;
    force?: boolean;
  } = {},
): { toCompact: Message[]; toKeep: Message[]; totalTokens: number } | null {
  const { triggerTokens = 60_000, compactFraction = 1 / 3, force = false } = options;

  if (all.length < 6) return null;

  const totalTokens = estimateMessageTokens(all);
  if (!force && totalTokens <= triggerTokens) return null;

  // Advance the cut boundary past any toolResult messages to avoid orphaned
  // tool results: a toolResult must always have its corresponding toolCall
  // visible in the same context window.
  let cutPoint = Math.max(1, Math.floor(all.length * compactFraction));
  while (cutPoint < all.length - 1 && all[cutPoint]!.role === "toolResult") {
    cutPoint++;
  }
  // Edge case: first loop stopped at all.length-1 and it's still a toolResult
  // (entire tail is toolResults). Pull back until toKeep starts on a safe boundary.
  while (cutPoint > 1 && all[cutPoint]!.role === "toolResult") {
    cutPoint--;
  }

  return {
    toCompact: all.slice(0, cutPoint),
    toKeep: all.slice(cutPoint),
    totalTokens,
  };
}

/**
 * Pure construction: build the synthetic compaction placeholder message.
 *
 * The returned message is a `user`-role message that replaces the compacted
 * slice in the visible context window.  No I/O is performed.
 */
export function buildCompactionMessage(params: {
  summary: string;
  archiveId: string;
  toCompact: Message[];
  totalTokens: number;
  compactFraction: number;
  timestamp: string;
  workspaceSnapshot?: string;
}): Message {
  const {
    summary,
    archiveId,
    toCompact,
    totalTokens,
    compactFraction,
    timestamp,
    workspaceSnapshot,
  } = params;

  const lines = [
    `[Conversation compacted at ${timestamp}. Full history preserved in messages.compactions/${archiveId}.jsonl.`,
    `Archive ID: ${archiveId}`,
    `${toCompact.length} messages (${Math.round(totalTokens * compactFraction)} tokens estimated) were compressed.`,
    ``,
    `Summary of compressed conversation:`,
    summary,
  ];

  if (workspaceSnapshot && workspaceSnapshot.trim().length > 0) {
    lines.push(``, `Sandbox workspace at time of compaction:`, workspaceSnapshot.trim());
  }

  lines.push(`]`);

  return {
    role: "user",
    content: lines.join("\n"),
    timestamp: Date.now(),
  } as Message;
}

/**
 * Build the NOTES.md entry that records a compaction summary.
 * Returned string is ready to be appended to NOTES.md (or the equivalent
 * memo document) — it starts with a blank line so repeated appends are spaced.
 */
export function buildCompactionNotesEntry(params: {
  summary: string;
  archiveId: string;
  compressedCount: number;
  timestamp: string;
}): string {
  const { summary, archiveId, compressedCount, timestamp } = params;
  return [
    ``,
    `## Compaction Summary [${timestamp}]`,
    ``,
    `*(${compressedCount} messages compressed, full history in \`messages.compactions/${archiveId}.jsonl\`)*`,
    ``,
    summary,
    ``,
  ].join("\n");
}
