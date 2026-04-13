/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { KBMetadata } from "@/knowledge/types.js";
import type { SkillMeta } from "@/skills/types.js";
import type { ContextProvider, MemoryIndex, Message } from "@agentrail/core";

/** Request-scoped data needed to build default capability context messages. */
export interface DefaultCapabilityContextOptions {
  tenantId: string;
  userId: string;
  sessionId: string;
  includeSkillsContext?: boolean;
  delegateSkillsToSubAgent: boolean;
  cacheTtlMs?: number;
  buildMemoryIndex(): Promise<MemoryIndex>;
  listKnowledgeMetadatas(): Promise<(KBMetadata | null)[]>;
  listSkills(): Promise<SkillMeta[]>;
  listWorkspaceSnapshot?(): Promise<string | undefined>;
  /**
   * Callback to persist compacted tool-result artifacts.
   * When provided, it is passed to `compactMessages` so the compaction
   * layer can store artifacts via the active session store rather than
   * writing directly to the filesystem.
   */
  writeToolResultArtifact?: (toolCallId: string, content: string) => Promise<void>;
  compactMessages?(
    messages: Message[],
    ctx?: {
      /** Callback to persist a compacted tool-result artifact. */
      writeToolResultArtifact?: (toolCallId: string, content: string) => Promise<void>;
    },
  ): Message[] | Promise<Message[]>;
}

/** Merges base and optional context providers into a single ordered list. */
export function createDefaultContextProviders(input: {
  baseProviders?: ContextProvider[];
  optionalProviders?: Array<ContextProvider | null | undefined>;
}): ContextProvider[] {
  return [
    ...(input.baseProviders ?? []),
    ...(input.optionalProviders ?? []).filter((p): p is ContextProvider => Boolean(p)),
  ];
}
