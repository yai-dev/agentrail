/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SessionRef } from "@agentrail/core";
import { resolveSessionRef } from "@agentrail/core";
import path from "node:path";
import { createFilesystemOrchestrationStore } from "./orchestration-store.js";
import type { RecoveredOrchestrationState } from "./recovery.js";
import type {
  OrchestrationEvent,
  OrchestrationMailboxEvent,
  OrchestrationMailboxState,
  OrchestrationSnapshot,
} from "./types.js";

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
  };
}
