/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

export type { SessionRef, SessionRefInfo } from "./session-ref.js";
export type { TodoStorage } from "./todo-storage.js";
export type { SessionTraceStore } from "./trace-store.js";
export type {
  CompactionMetadata,
  MemoryIndex,
  MemoryIndexEntry,
  SessionContextUsage,
  SessionEvent,
  SessionEventType,
  SessionHandle,
  SessionInfo,
  SessionInitEvent,
  SessionMeta,
  SessionTurnEvent,
  SessionUpdateEvent,
} from "./types.js";

export { compactToolResults } from "./compaction.js";
export { SessionManager, isCompactionMessage, parseCompactionMetadata } from "./session-manager.js";
export { createSessionRef, resolveSessionRef } from "./session-ref.js";
export { estimateFileTokens, estimateMessageTokens, estimateTokens } from "./token-estimator.js";
export { createFileSystemSessionTraceStore } from "./trace-store.js";
/** View-only tool-result compaction thresholds exported by the memo package. */
export type { ToolResultCompactionOptions } from "./compaction.js";
