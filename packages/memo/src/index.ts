/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

export type {
  SessionInfo,
  SessionMeta,
  SessionEvent,
  SessionInitEvent,
  SessionTurnEvent,
  SessionUpdateEvent,
  SessionEventType,
  SessionContextUsage,
  MemoryIndexEntry,
  MemoryIndex,
  CompactionMetadata,
} from "./types.js";

export {
  SessionManager,
  isCompactionMessage,
  parseCompactionMetadata,
} from "./session-manager.js";
export { estimateTokens, estimateFileTokens, estimateMessageTokens } from "./token-estimator.js";
export { compactToolResults } from "./compaction.js";
export type { ToolResultCompactionOptions } from "./compaction.js";
