/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { KnowledgeManager } from "@/knowledge/index.js";
import type { ToolPermissionPolicy } from "@/permissions/index.js";
import type { SandboxManager } from "@/sandbox/index.js";
import type { SkillManager } from "@/skills/index.js";
import type { WaitHandleRegistry } from "@/tools/index.js";
import type {
  AgentrailSessionStore,
  ContextProvider,
  ModelConfig,
  RuntimeTool,
  SessionRef,
  TransformContextFn,
} from "@agentrail/core";

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
  /** Optional override for the sandbox manager (e.g. custom image). */
  sandboxManager?: SandboxManager;
  /** Optional override for the knowledge manager. */
  knowledgeManager?: KnowledgeManager;
  /** Optional override for the skills manager. */
  skillManager?: SkillManager;
  /** Populated by the tools capability (ask-user-question tool). */
  waitHandleRegistry?: WaitHandleRegistry;
  /** Forwarded to the sub-agent orchestration system. */
  onSubAgentEvent?: (event: object) => void;
  /**
   * Tracing context for the current request chain.
   * `chainId` is the same string as the route-level `traceId`/`requestTraceId`.
   * `depth` is 0 for the root agent, incremented by 1 for each sub-agent level.
   */
  tracing?: { chainId: string; depth: number };
  /**
   * Active permission policy for this session.  When present, non-sandboxed
   * file and shell tools evaluate it via `checkPermissions` before executing.
   * Sandboxed Bash also honours command-level allow/deny/ask rules.
   */
  permissionPolicy?: ToolPermissionPolicy;
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
  /** Optionally builds a full-message transform for request-time rewrites. */
  buildTransformContext?(
    ctx: CapabilityBuildContext,
  ): Promise<TransformContextFn | undefined> | TransformContextFn | undefined;
}
