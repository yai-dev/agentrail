/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  AgentrailSessionStore,
  ContextProvider,
  MemoryIndex,
  Message,
  ModelConfig,
  RuntimeTool,
  SessionRef,
} from "@agentrail/core";
import type { KBMetadata, KnowledgeManager } from "./knowledge/index.js";
import type { OrchestrationManager } from "./orchestration/index.js";
import type { SandboxManager } from "./sandbox/index.js";
import type { SkillManager, SkillMeta } from "./skills/index.js";
import type { WaitHandleRegistry } from "./tools/index.js";

/**
 * Request-scoped context passed to `CapabilityDescriptor.buildTools` and
 * `buildContextProviders` when wiring up a profile's tool set.
 *
 * All optional fields are populated by `createAgentApp()` based on which
 * capability descriptors are present in the profile.
 *
 * @see {@link https://agentrail.run/concepts/capabilities}
 */
export interface CapabilityBuildContext {
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionRef: SessionRef;
  sessionStore: AgentrailSessionStore;
  modelConfig?: ModelConfig;
  /** Populated when a filesystem or browser capability is present. */
  sandboxManager?: SandboxManager;
  /** Populated when a knowledge capability is present. */
  knowledgeManager?: KnowledgeManager;
  /** Populated when a skills capability is present. */
  skillManager?: SkillManager;
  /** Populated when an orchestration capability is present. */
  orchestrationManager?: OrchestrationManager;
  /** Populated by the tools capability (ask-user-question tool). */
  waitHandleRegistry?: WaitHandleRegistry;
  /** Delegates skill invocations to a managed sub-agent when true. */
  delegateSkillsToSubAgent?: boolean;
  /** Forwarded to the sub-agent orchestration system. */
  onSubAgentEvent?: (event: object) => void;
  /** Returns the current memory/notes index for the active session. */
  buildMemoryIndex?: () => Promise<MemoryIndex>;
  /** Returns knowledge base metadata for the current tenant. */
  listKnowledgeMetadatas?: () => Promise<(KBMetadata | null)[]>;
  /** Returns available skill definitions for the current tenant. */
  listSkills?: () => Promise<SkillMeta[]>;
  /** Returns the current workspace snapshot from the sandbox, if available. */
  listWorkspaceSnapshot?: () => Promise<string | undefined>;
  /** Compact message history to fit context window constraints. */
  compactMessages?: (messages: Message[]) => Message[];
}

/**
 * Describes an app-layer capability: a composable unit that contributes
 * tools and/or context providers to an agent when a profile is executed.
 *
 * Use the factory functions (`filesystem()`, `knowledge()`, `skills()`, etc.)
 * to create capability descriptors and pass them to `defineProfile()`.
 *
 * @see {@link https://agentrail.run/concepts/capabilities}
 */
export interface CapabilityDescriptor {
  /** Stable type identifier for this capability (e.g. `"filesystem"`). */
  readonly type: string;
  /** Builds the tools this capability contributes to the agent. */
  buildTools(ctx: CapabilityBuildContext): Promise<RuntimeTool[]>;
  /** Optionally builds context providers for message injection. */
  buildContextProviders?(ctx: CapabilityBuildContext): ContextProvider[];
}
