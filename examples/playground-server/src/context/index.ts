/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import {
  createDefaultCapabilityContextProviders,
  createDefaultCapabilityTransformContext,
  createOrchestrationRegistry,
  type ContextProvider,
  type CreateSessionManagedAgent,
} from "@agentrail/app";
import { KnowledgeManager } from "@agentrail/capabilities";
import { SessionManager, compactToolResults } from "@agentrail/app";
import { UserMemoryConsolidationService } from "@agentrail/app";
import type { TransformContextFn } from "@agentrail/core";
import { SandboxManager } from "@agentrail/capabilities";
import { SkillManager } from "@agentrail/capabilities";
import { config } from "../config.js";

const TRANSFORM_CACHE_TTL_MS = 5_000;

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

interface OrchestrationManagerRequest {
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionRef: import("@agentrail/core").SessionRef;
  createManagedAgent: CreateSessionManagedAgent;
}

const orchestrationManagerRegistry = createOrchestrationRegistry({
  dataDir: config.dataDir,
});

export function getOrchestrationManager(request: OrchestrationManagerRequest) {
  return orchestrationManagerRegistry.getManager(request);
}

export function invalidateOrchestrationManager(tenantId: string, sessionId: string): void {
  orchestrationManagerRegistry.invalidate(tenantId, sessionId);
}

/**
 * Build the transformContext function for a specific request.
 * Injects date, memory index, knowledge base index, and skills index as
 * context messages prepended to the conversation history.
 *
 * Context is injected as `role: "user"` messages (not appended to the system
 * prompt) because `TransformContextFn` only receives the messages array.
 * Bracket tags like `[Memory Index]` let the model distinguish injected
 * context from genuine user messages.
 *
 * Optimizations applied here:
 * 1. Short TTL cache (5 s): the static context messages (date, memory index,
 *    KB list, skills) are rebuilt at most once per 5 seconds within a single
 *    agentic loop, avoiding redundant parallel file I/O on back-to-back LLM
 *    calls within the same request.
 * 2. Tool result compaction (layer 1): large ToolResultMessages in the
 *    conversation history are replaced in-memory with a short placeholder,
 *    keeping the context window lean without losing the originals on disk.
 */
export function buildTransformContext(
  tenantId: string,
  userId: string,
  sessionId: string,
  options: { includeSkillsContext?: boolean } = {},
): TransformContextFn {
  return createDefaultCapabilityTransformContext({
    tenantId,
    userId,
    sessionId,
    includeSkillsContext: options.includeSkillsContext,
    delegateSkillsToSubAgent: config.skillDelegateToSubAgent,
    cacheTtlMs: TRANSFORM_CACHE_TTL_MS,
    buildMemoryIndex: () => sessionManager.buildMemoryIndex(tenantId, userId, sessionId),
    listKnowledgeMetadatas: async () => {
      const kbList = await knowledgeManager.listKbs(tenantId);
      return Promise.all(kbList.map((id) => knowledgeManager.getMetadata(tenantId, id)));
    },
    listSkills: () => skillManager.listSkills(),
    listWorkspaceSnapshot: () => sandboxManager.listWorkspace(sessionId),
    compactMessages: compactToolResults,
  });
}

export function buildContextProviders(
  tenantId: string,
  userId: string,
  sessionId: string,
  options: { includeSkillsContext?: boolean } = {},
): ContextProvider[] {
  return createDefaultCapabilityContextProviders({
    tenantId,
    userId,
    sessionId,
    includeSkillsContext: options.includeSkillsContext,
    delegateSkillsToSubAgent: config.skillDelegateToSubAgent,
    cacheTtlMs: TRANSFORM_CACHE_TTL_MS,
    buildMemoryIndex: () => sessionManager.buildMemoryIndex(tenantId, userId, sessionId),
    listKnowledgeMetadatas: async () => {
      const kbList = await knowledgeManager.listKbs(tenantId);
      return Promise.all(kbList.map((id) => knowledgeManager.getMetadata(tenantId, id)));
    },
    listSkills: () => skillManager.listSkills(),
    listWorkspaceSnapshot: () => sandboxManager.listWorkspace(sessionId),
    compactMessages: compactToolResults,
  });
}
