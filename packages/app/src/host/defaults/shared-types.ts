/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { KBMetadata, KnowledgeManager } from "@agentrail/capabilities";
import type { MemoryIndex, SessionRef } from "@agentrail/core";
import type { Message, ModelConfig, RuntimeTool, UserMessage } from "@agentrail/core";
import type { SandboxManager } from "@agentrail/capabilities";
import type { ExtendedSseEvent, SkillManager, SkillMeta } from "@agentrail/capabilities";
import type { WaitHandleRegistry } from "@agentrail/capabilities";
import type {
  AgentrailChatHandledResponse,
  AgentrailProfile,
  AgentrailProfileContext,
  AgentrailSessionStore,
  ContextProvider,
} from "@/host/types.js";

/**
 * Rich hosted profile definition used by the host defaults helpers.
 *
 * @deprecated Use `defineProfile()` with `capabilities` instead.
 * `HostedProfileDefinition` will be removed in a future release once all
 * consumers have migrated to `ProfileDefinition` / `AgentrailProfile`.
 */
export interface HostedProfileDefinition extends AgentrailProfile {
  /** Optional static prompt string used when building the runtime agent. */
  prompt?: string;
  /** Optional async prompt builder invoked per request. */
  promptBuilder?: (context: AgentrailProfileContext) => string | Promise<string>;
  /**
   * Additional context providers exposed only by this profile.
   *
   * @deprecated Implement `getContextProviders` on `AgentrailProfile` directly,
   * or declare `capabilities` on `defineProfile()` — capability descriptors
   * populate `AgentrailProfile.getContextProviders` automatically.
   */
  getContextProviders?: (
    context: AgentrailProfileContext,
  ) => Promise<ContextProvider[]> | ContextProvider[];
  /**
   * Optional early-return hook for chat requests.
   *
   * @deprecated Use `AgentrailPlugin.interceptChatRequest` instead.
   * Plugins provide the same interception capability with a cleaner separation
   * of concerns between request handling and agent definition.
   */
  handleChat?: (context: {
    request: {
      message: string;
      mode?: string;
      tenantId: string;
      userId: string;
      sessionId?: string;
      agentId?: string;
    };
    agentId: string;
    tenantId: string;
    userId: string;
    sessionId: string;
    signal: AbortSignal;
  }) => Promise<AgentrailChatHandledResponse | null> | AgentrailChatHandledResponse | null;
  /** Optional factory for orchestration-managed agents. */
  createManagedAgent?: unknown;
  /** Optional builder for orchestration start-run input. */
  createStartRunInput?: unknown;
}

/** Inputs used to assemble a final ordered context-provider list. */
export interface DefaultContextProvidersInput {
  baseProviders?: ContextProvider[];
  optionalProviders?: Array<ContextProvider | null | undefined>;
}

/** Inputs used to assemble the default hosted toolset. */
export interface DefaultToolsetInput {
  executionTools?: RuntimeTool[];
  browserTools?: RuntimeTool[];
  orchestrationTools?: RuntimeTool[];
  capabilityTools?: RuntimeTool[];
  optionalTools?: Array<RuntimeTool | null | undefined>;
}

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
  compactMessages?(
    messages: Message[],
    ctx?: { sessionDir?: string },
  ): Message[] | Promise<Message[]>;
}

/** Subset of default capability tools returned by helper builders. */
export interface DefaultCapabilityTools {
  executionTools: RuntimeTool[];
  browserTools: RuntimeTool[];
  skillTool: RuntimeTool | null;
}

/** Inputs needed to create the default capability tool bundle. */
export interface DefaultCapabilityToolOptions {
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionRef: SessionRef;
  sessionStore: AgentrailSessionStore;
  knowledgeManager: KnowledgeManager;
  sandboxManager: SandboxManager;
  waitHandleRegistry: WaitHandleRegistry;
  modelConfig: ModelConfig;
  includeSkillTool?: boolean;
  delegateSkillsToSubAgent?: boolean;
  skillManager?: SkillManager;
  onSubAgentEvent?: (event: ExtendedSseEvent) => void;
  containerSkillsDir?: string;
}

/** Factory that creates a synthetic user message for contextual system hints. */
export type DefaultCapabilityMessageFactory = (timestamp?: number) => UserMessage;
