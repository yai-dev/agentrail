/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  Message,
  ModelConfig,
  RuntimeTool,
  UserMessage,
} from "@agentrail/runtime-core";
import type { MemoryIndex } from "@agentrail/memo";
import type { KBMetadata, KnowledgeManager } from "@agentrail/knowledge";
import type {
  ExtendedSseEvent,
  SkillManager,
  SkillMeta,
} from "@agentrail/skills";
import type { SandboxManager } from "@agentrail/sandbox";
import type { WaitHandleRegistry } from "@agentrail/tools";
import type {
  AgentrailChatHandledResponse,
  AgentrailProfile,
  AgentrailProfileContext,
  ContextProvider,
} from "../types.js";

export interface HostedProfileDefinition extends AgentrailProfile {
  prompt?: string;
  promptBuilder?: (
    context: AgentrailProfileContext,
  ) => string | Promise<string>;
  getContextProviders?: (
    context: AgentrailProfileContext,
  ) => Promise<ContextProvider[]> | ContextProvider[];
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
    sessionDir: string;
    signal: AbortSignal;
  }) => Promise<AgentrailChatHandledResponse | null> | AgentrailChatHandledResponse | null;
  createManagedAgent?: unknown;
  createStartRunInput?: unknown;
}

export interface DefaultContextProvidersInput {
  baseProviders?: ContextProvider[];
  optionalProviders?: Array<ContextProvider | null | undefined>;
}

export interface DefaultToolsetInput {
  executionTools?: RuntimeTool[];
  browserTools?: RuntimeTool[];
  orchestrationTools?: RuntimeTool[];
  capabilityTools?: RuntimeTool[];
  optionalTools?: Array<RuntimeTool | null | undefined>;
}

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
  compactMessages?(messages: Message[]): Message[];
}

export interface DefaultCapabilityTools {
  executionTools: RuntimeTool[];
  browserTools: RuntimeTool[];
  skillTool: RuntimeTool | null;
}

export interface DefaultCapabilityToolOptions {
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionDir: string;
  knowledgeManager: KnowledgeManager;
  sandboxManager: SandboxManager;
  waitHandleRegistry: WaitHandleRegistry;
  modelConfig: ModelConfig;
  includeSkillTool?: boolean;
  delegateSkillsToSubAgent?: boolean;
  skillManager?: SkillManager;
  onSubAgentEvent?: (event: ExtendedSseEvent) => void;
  containerSkillsDir?: string;
  subAgentLogDir?: string;
}

export type DefaultCapabilityMessageFactory = (
  timestamp?: number,
) => UserMessage;
