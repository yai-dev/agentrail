/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

export interface SessionInfo {
  sessionId: string;
  tenantId: string;
  userId: string;
  agentId: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SessionHandle extends SessionInfo {
  sessionRef: import("./session-ref.js").SessionRef;
}

/** Lightweight session descriptor for listing sessions by user. */
export interface SessionMeta {
  sessionId: string;
  updatedAt: number;
}

/** Event types persisted in `session.jsonl`. */
export type SessionEventType = "init" | "turn" | "update";

/** Initial session event written when a session is first created. */
export interface SessionInitEvent {
  type: "init";
  sessionId: string;
  tenantId: string;
  userId: string;
  agentId: string;
  title: string | null;
  createdAt: number;
}

/** Event written after a completed assistant turn. */
export interface SessionTurnEvent {
  type: "turn";
  turnIndex: number;
  inputTokens: number;
  outputTokens: number;
  /** Tokens read from provider cache (Anthropic prompt caching) */
  cacheReadTokens: number;
  /** Tokens written to provider cache */
  cacheWriteTokens: number;
  updatedAt: number;
}

/**
 * Snapshot of the true context window usage for the most recent turn.
 * inputTokens = non-cached + cacheRead + cacheWrite (total sent to LLM).
 */
export interface SessionContextUsage {
  inputTokens: number;
  outputTokens: number;
  budgetUsedPct: number;
}

/** Event used for lightweight session metadata updates such as title changes. */
export interface SessionUpdateEvent {
  type: "update";
  title?: string;
  updatedAt: number;
}

/** Union of all session events persisted by the memo package. */
export type SessionEvent = SessionInitEvent | SessionTurnEvent | SessionUpdateEvent;

/** One file entry exposed in the memory index summary. */
export interface MemoryIndexEntry {
  /** Memory file name (e.g. NOTES.md) */
  name: string;
  /** Absolute path — pass directly to readTool */
  path: string;
  exists: boolean;
  /** Approximate token count (charCount / 4) */
  sizeTokensApprox: number;
  /** Last modified timestamp in ms, null if file doesn't exist */
  updatedAt: number | null;
  /** One-line summary extracted from <!-- summary: ... --> at the top of the file */
  summary: string | null;
}

/** Session and user memory files exposed to hosted profiles and tools. */
export interface MemoryIndex {
  /** Absolute path to the session directory */
  sessionDir: string;
  /** Absolute path to the user directory (USER.md lives here) */
  userDir: string;
  entries: MemoryIndexEntry[];
}

/** Metadata encoded into synthetic compaction placeholder messages. */
export interface CompactionMetadata {
  archiveId: string | null;
  compressedCount: number;
}
