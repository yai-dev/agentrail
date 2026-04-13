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
import type { MemoryIndex, Message, SessionRef } from "@agentrail/core";

export type { DefaultCapabilityContextOptions } from "@/memory/types.js";

/** Minimal session reference passed to each builder function. */
export interface MemorySessionContext {
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionRef: SessionRef;
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
  /**
   * Persists a compacted tool-result artifact to the backing store for the
   * current session.  Called by `compactMessages` (via `ctx.writeToolResultArtifact`)
   * when a tool result is too large to keep inline.
   *
   * Implement this builder to unlock artifact persistence with any storage
   * backend.  The implementation should also call
   * `sandboxManager.refreshMemoMirror(ctx.sessionId, ...)` when a live sandbox
   * exists so the agent can immediately read the new artifact from inside the
   * container.
   *
   * @example
   * ```ts
   * writeToolResultArtifact: async (ctx, toolCallId, content) => {
   *   const sessionRef = `${ctx.tenantId}:${ctx.sessionId}`;
   *   await Promise.all([
   *     store.writeToolResultArtifact?.(sessionRef, toolCallId, content),
   *     sandboxManager.refreshMemoMirror(
   *       ctx.sessionId,
   *       `/workspace/memo/session/tool-results/${toolCallId}.txt`,
   *       content,
   *     ),
   *   ]);
   * }
   * ```
   */
  writeToolResultArtifact?(
    ctx: MemorySessionContext,
    toolCallId: string,
    content: string,
  ): Promise<void>;
  /**
   * Compacts message history to reduce context window usage.
   * Receives `ctx.writeToolResultArtifact` when `writeToolResultArtifact` is
   * configured above — use it instead of the deprecated `sessionDir`.
   */
  compactMessages?(
    messages: Message[],
    ctx?: {
      /** Persists a compacted tool-result artifact. Prefer over `sessionDir`. */
      writeToolResultArtifact?: (toolCallId: string, content: string) => Promise<void>;
    },
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
        sessionRef: ctx.sessionRef,
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
        sessionRef: ctx.sessionRef,
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
          writeToolResultArtifact: builders.writeToolResultArtifact
            ? (toolCallId, content) =>
                builders.writeToolResultArtifact!(sessionCtx, toolCallId, content)
            : undefined,
          compactMessages: builders.compactMessages,
        },
        state,
      );
    },
  };
}
