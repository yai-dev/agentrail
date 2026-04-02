/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SessionRef } from "@agentrail/memo";
import { resolveSessionRef } from "@agentrail/memo";
import path from "node:path";
import { OrchestrationStore } from "./orchestration-store.js";
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

export function getSessionDirForRef(dataDir: string, sessionRef: SessionRef): string {
  const { tenantId, sessionId } = resolveSessionRef(sessionRef);
  return path.join(dataDir, "tenants", tenantId, "sessions", sessionId);
}

export function createFilesystemOrchestrationPersistence(
  dataDir: string,
  sessionRef: SessionRef,
): OrchestrationPersistence {
  const sessionDir = getSessionDirForRef(dataDir, sessionRef);
  return createFilesystemOrchestrationPersistenceForSessionDir(sessionDir);
}

export function createFilesystemOrchestrationPersistenceForSessionDir(
  sessionDir: string,
): OrchestrationPersistence {
  return {
    appendEvent: (event) => OrchestrationStore.appendEvent(sessionDir, event),
    loadEvents: () => OrchestrationStore.loadEvents(sessionDir),
    loadSnapshot: () => OrchestrationStore.loadSnapshot(sessionDir),
    writeCheckpoint: (snapshot) => OrchestrationStore.writeCheckpoint(sessionDir, snapshot),
    recoverState: () => OrchestrationStore.recoverState(sessionDir),
    appendMailboxEvent: (agentId, event) =>
      OrchestrationStore.appendMailboxEvent(sessionDir, agentId, event),
    loadMailboxEvents: (agentId) => OrchestrationStore.loadMailboxEvents(sessionDir, agentId),
    loadMailboxState: (agentId) => OrchestrationStore.loadMailboxState(sessionDir, agentId),
    writeMailboxState: (agentId, state) =>
      OrchestrationStore.writeMailboxState(sessionDir, agentId, state),
  };
}
