/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { KBMetadata } from "@/knowledge/types.js";
import {
  createDefaultCapabilityContextProviders,
  createDefaultCapabilityContextState,
  createDefaultCapabilityTransformContext,
} from "@/memory/context.js";
import type { SkillMeta } from "@/skills/types.js";
import type { CapabilityBuildContext, CapabilityDescriptor } from "@/types.js";
import type { MemoryIndex, Message } from "@agentrail/core";

export type { DefaultCapabilityContextOptions } from "@/memory/types.js";

/** Minimal session reference passed to each builder function. */
export interface MemorySessionContext {
  tenantId: string;
  userId: string;
  sessionId: string;
}

/**
 * Self-contained builder functions captured at profile definition time.
 * Each function receives the current session context and returns the data
 * needed to assemble memory/knowledge/skills context messages.
 */
export interface MemoryContextBuilders {
  /** Required — builds the memory/notes index for the current session. */
  buildMemoryIndex(ctx: MemorySessionContext): Promise<MemoryIndex>;
  /** Returns knowledge base metadata for the current tenant. */
  listKnowledgeMetadatas?(ctx: MemorySessionContext): Promise<(KBMetadata | null)[]>;
  /** Returns available skill definitions. */
  listSkills?(ctx: MemorySessionContext): Promise<SkillMeta[]>;
  /** Returns the current workspace snapshot from the sandbox, if available. */
  listWorkspaceSnapshot?(ctx: MemorySessionContext): Promise<string | undefined>;
  /** Compacts message history to reduce context window usage. */
  compactMessages?(
    messages: Message[],
    ctx?: { sessionDir?: string },
  ): Message[] | Promise<Message[]>;
  /** When true, skills are delegated to a managed sub-agent. Defaults to false. */
  delegateSkillsToSubAgent?: boolean;
}

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
 * All data sources are captured at definition time via `builders`, making
 * the capability fully self-contained.
 *
 * ```ts
 * memoryContext({
 *   buildMemoryIndex: (ctx) => sessionManager.buildMemoryIndex(ctx.tenantId, ctx.userId, ctx.sessionId),
 *   listKnowledgeMetadatas: async (ctx) => { ... },
 *   listSkills: () => skillManager.listSkills(),
 * })
 * ```
 *
 * @see {@link https://agentrail.run/capabilities/memory-context}
 */
export function memoryContext(
  builders: MemoryContextBuilders,
  opts?: MemoryContextOptions,
): CapabilityDescriptor {
  const stateBySession = new Map<string, ReturnType<typeof createDefaultCapabilityContextState>>();

  function getState(ctx: CapabilityBuildContext) {
    const key = `${ctx.tenantId}:${ctx.userId}:${ctx.sessionId}`;
    let state = stateBySession.get(key);
    if (!state) {
      state = createDefaultCapabilityContextState();
      stateBySession.set(key, state);
    }
    return state;
  }

  return {
    type: "memory-context",

    async buildTools(_ctx: CapabilityBuildContext) {
      return [];
    },

    buildContextProviders(ctx: CapabilityBuildContext) {
      const sessionCtx: MemorySessionContext = {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        sessionId: ctx.sessionId,
      };
      const state = getState(ctx);
      return createDefaultCapabilityContextProviders(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          includeSkillsContext: opts?.includeSkillsContext ?? true,
          delegateSkillsToSubAgent: builders.delegateSkillsToSubAgent ?? false,
          cacheTtlMs: opts?.cacheTtlMs,
          buildMemoryIndex: () => builders.buildMemoryIndex(sessionCtx),
          listKnowledgeMetadatas: builders.listKnowledgeMetadatas
            ? () => builders.listKnowledgeMetadatas!(sessionCtx)
            : () => Promise.resolve([]),
          listSkills: builders.listSkills
            ? () => builders.listSkills!(sessionCtx)
            : () => Promise.resolve([]),
          listWorkspaceSnapshot: builders.listWorkspaceSnapshot
            ? () => builders.listWorkspaceSnapshot!(sessionCtx)
            : undefined,
          compactMessages: builders.compactMessages,
        },
        state,
      );
    },

    buildTransformContext(ctx: CapabilityBuildContext) {
      const sessionCtx: MemorySessionContext = {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        sessionId: ctx.sessionId,
      };
      const state = getState(ctx);

      return createDefaultCapabilityTransformContext(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          includeSkillsContext: opts?.includeSkillsContext ?? true,
          delegateSkillsToSubAgent: builders.delegateSkillsToSubAgent ?? false,
          cacheTtlMs: opts?.cacheTtlMs,
          buildMemoryIndex: () => builders.buildMemoryIndex(sessionCtx),
          listKnowledgeMetadatas: builders.listKnowledgeMetadatas
            ? () => builders.listKnowledgeMetadatas!(sessionCtx)
            : () => Promise.resolve([]),
          listSkills: builders.listSkills
            ? () => builders.listSkills!(sessionCtx)
            : () => Promise.resolve([]),
          listWorkspaceSnapshot: builders.listWorkspaceSnapshot
            ? () => builders.listWorkspaceSnapshot!(sessionCtx)
            : undefined,
          compactMessages: builders.compactMessages,
        },
        state,
      );
    },
  };
}
