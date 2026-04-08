/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { SessionManager, compactToolResults } from "@agentrail/app";
import { createOrchestrationRegistry } from "@agentrail/app/advanced";
import { KnowledgeManager, SandboxManager, SkillManager } from "@agentrail/capabilities";
import { UserMemoryConsolidationService } from "@agentrail/app";
import { config } from "@/config.js";

// Module-level singletons — one instance per process, shared across all
// request handlers. State is per-tenant/session, not per-instance.
export const sessionManager = new SessionManager(config.dataDir);
export const knowledgeManager = new KnowledgeManager(config.dataDir);
export const skillManager = new SkillManager(config.dataDir);
export const sandboxManager = new SandboxManager(config.dataDir, config.sandbox);
export const userMemoryConsolidationService = new UserMemoryConsolidationService(
  sessionManager,
  config.dataDir,
  {
    provider: config.provider,
    modelId: config.modelId,
    baseUrl: config.baseUrl,
    enabled: config.userMemory.enabled,
    idleMinutes: config.userMemory.idleMinutes,
    scanIntervalMinutes: config.userMemory.scanIntervalMinutes,
    minIntervalHours: config.userMemory.minIntervalHours,
    minChangedSessions: config.userMemory.minChangedSessions,
  },
);

export const orchestrationRegistry = createOrchestrationRegistry({
  dataDir: config.dataDir,
});

/** @deprecated Use orchestrationRegistry.getManager() directly */
export function getOrchestrationManager(request: Parameters<typeof orchestrationRegistry.getManager>[0]) {
  return orchestrationRegistry.getManager(request);
}

export function invalidateOrchestrationManager(tenantId: string, sessionId: string): void {
  orchestrationRegistry.invalidate(tenantId, sessionId);
}

// Context-building helpers (legacy helpers kept for compatibility with other
// parts of the server; the default profile now uses self-contained builders).

export function buildMemoryIndex(
  tenantId: string,
  userId: string,
  sessionId: string,
) {
  return () => sessionManager.buildMemoryIndex(tenantId, userId, sessionId);
}

export async function listKnowledgeMetadatas(tenantId: string) {
  const kbList = await knowledgeManager.listKbs(tenantId);
  return Promise.all(kbList.map((id) => knowledgeManager.getMetadata(tenantId, id)));
}

export const listSkills = () => skillManager.listSkills();
export const listWorkspaceSnapshot = (sessionId: string) => () => sandboxManager.listWorkspace(sessionId);
export { compactToolResults as compactMessages };
