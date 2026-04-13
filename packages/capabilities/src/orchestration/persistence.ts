/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createFilesystemOrchestrationStore } from "@/orchestration/orchestration-store.js";
import type { RecoveredOrchestrationState } from "@/orchestration/recovery.js";
import type {
  OrchestrationEvent,
  OrchestrationMailboxEvent,
  OrchestrationMailboxState,
  OrchestrationSnapshot,
} from "@/orchestration/types.js";
import type { SessionRef } from "@agentrail/core";
import { resolveSessionRef } from "@agentrail/core";
import path from "node:path";

export interface OrchestrationPersistence {
  appendEvent(event: OrchestrationEvent): Promise<void>;
  loadEvents(): Promise<OrchestrationEvent[]>;
  loadSnapshot(): Promise<OrchestrationSnapshot | null>;
  writeCheckpoint(snapshot: OrchestrationSnapshot): Promise<void>;
  recoverState(): Promise<RecoveredOrchestrationState>;
  appendMailboxEvent(agentId: string, event: OrchestrationMailboxEvent): Promise<void>;
  loadMailboxEvents(agentId: string): Promise<OrchestrationMailboxEvent[]>;
  loadMailboxState(agentId: string): Promise<OrchestrationMailboxState>;
  writeMailboxState(agentId: string, state: OrchestrationMailboxState): Promise<void>;

  /**
   * Load the persisted message history for a managed sub-agent.
   * Used by the worker process to resume a paused sub-agent across turn boundaries.
   */
  loadAgentHistory(agentId: string): Promise<unknown[]>;

  /**
   * Persist the message history for a managed sub-agent after each turn.
   * The history is keyed by `agentId` within the orchestration session.
   */
  writeAgentHistory(agentId: string, history: unknown[]): Promise<void>;
}

// Filesystem persistence still resolves a session root internally, but the
// public API accepts a SessionRef so raw paths do not leak across package boundaries.
function getSessionDirForRef(dataDir: string, sessionRef: SessionRef): string {
  const { tenantId, sessionId } = resolveSessionRef(sessionRef);
  return path.join(dataDir, "tenants", tenantId, "sessions", sessionId);
}

/** Creates the default filesystem persistence adapter for one session reference. */
export function createFilesystemOrchestrationPersistence(
  dataDir: string,
  sessionRef: SessionRef,
): OrchestrationPersistence {
  const sessionDir = getSessionDirForRef(dataDir, sessionRef);
  const store = createFilesystemOrchestrationStore(sessionDir);
  return {
    appendEvent: (event) => store.appendEvent(event),
    loadEvents: () => store.loadEvents(),
    loadSnapshot: () => store.loadSnapshot(),
    writeCheckpoint: (snapshot) => store.writeCheckpoint(snapshot),
    recoverState: () => store.recoverState(),
    appendMailboxEvent: (agentId, event) => store.appendMailboxEvent(agentId, event),
    loadMailboxEvents: (agentId) => store.loadMailboxEvents(agentId),
    loadMailboxState: (agentId) => store.loadMailboxState(agentId),
    writeMailboxState: (agentId, state) => store.writeMailboxState(agentId, state),
    loadAgentHistory: (agentId) => store.loadAgentHistory(agentId),
    writeAgentHistory: (agentId, history) => store.writeAgentHistory(agentId, history),
  };
}
