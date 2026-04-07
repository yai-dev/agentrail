/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { CapabilityBuildContext, CapabilityDescriptor } from "../types.js";
import {
  createDefaultCapabilityContextProviders,
} from "./context.js";

export type { DefaultCapabilityContextOptions } from "./types.js";

export interface MemoryContextOptions {
  /** Include the skills context summary in injected messages. Defaults to true. */
  includeSkillsContext?: boolean;
  /** Context message cache TTL in milliseconds. Defaults to 5000. */
  cacheTtlMs?: number;
}

/**
 * Capability that injects session memory, identity, date, knowledge, and
 * skills context messages into every agent turn via context providers.
 *
 * This is the standard way to give an agent awareness of the user's notes,
 * memory files, available knowledge bases, and installed skills.
 *
 * @see {@link https://agentrail.run/capabilities/memory-context}
 */
export function memoryContext(opts?: MemoryContextOptions): CapabilityDescriptor {
  return {
    type: "memory-context",

    async buildTools(_ctx: CapabilityBuildContext) {
      return [];
    },

    buildContextProviders(ctx: CapabilityBuildContext) {
      const {
        tenantId,
        userId,
        sessionId,
        buildMemoryIndex,
        listKnowledgeMetadatas,
        listSkills,
        listWorkspaceSnapshot,
        compactMessages,
        delegateSkillsToSubAgent = false,
      } = ctx;

      if (!buildMemoryIndex) {
        return [];
      }

      return createDefaultCapabilityContextProviders({
        tenantId,
        userId,
        sessionId,
        includeSkillsContext: opts?.includeSkillsContext ?? true,
        delegateSkillsToSubAgent,
        cacheTtlMs: opts?.cacheTtlMs,
        buildMemoryIndex,
        listKnowledgeMetadatas: listKnowledgeMetadatas ?? (() => Promise.resolve([])),
        listSkills: listSkills ?? (() => Promise.resolve([])),
        listWorkspaceSnapshot,
        compactMessages,
      });
    },
  };
}
