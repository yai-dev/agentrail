/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { SessionManager } from "@agentrail/app";
import type { SessionRef } from "@agentrail/core";
import type { ModelConfig } from "@agentrail/core";
import {
  askUser,
  browser,
  filesystem,
  knowledge,
  type CapabilityBuildContext,
  type CreateManagedAgentInput,
  type SubAgentRuntime,
} from "@agentrail/capabilities";
import type { RuntimeTool, TransformContextFn } from "@agentrail/core";

import { config } from "@/config.js";
import { knowledgeManager, sandboxManager } from "@/context/index.js";
import { buildSystemPrompt } from "@/prompts/index.js";
import { waitHandleRegistry } from "@/wait-handle-registry.js";

export interface DefaultSubAgentRuntimeConfig {
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionRef: SessionRef;
  dataDir: string;
}

export class DefaultSubAgentRuntime implements SubAgentRuntime {
  private readonly tenantId: string;
  private readonly userId: string;
  private readonly sessionId: string;
  private readonly sessionRef: SessionRef;
  private readonly dataDir: string;

  constructor(runtimeConfig: DefaultSubAgentRuntimeConfig) {
    this.tenantId = runtimeConfig.tenantId;
    this.userId = runtimeConfig.userId;
    this.sessionId = runtimeConfig.sessionId;
    this.sessionRef = runtimeConfig.sessionRef;
    this.dataDir = runtimeConfig.dataDir;
  }

  getModelConfig(): ModelConfig {
    return {
      provider: config.provider,
      modelId: config.modelId,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    };
  }

  buildSystemPrompt(input: CreateManagedAgentInput): string {
    return [
      buildSystemPrompt(),
      "[Native Orchestration Sub-Agent]",
      `agent_id: ${input.agentId}`,
      `run_id: ${input.runId}`,
      `task_id: ${input.taskId}`,
      `assigned_role: ${input.role}`,
      "You are a delegated sub-agent for the main hosted assistant.",
      "Focus on the assigned role and the orchestration inputs you receive.",
      "You do not have native orchestration tools and must not attempt to create more sub-agents.",
    ].join("\n\n");
  }

  async buildTools(_input: CreateManagedAgentInput): Promise<RuntimeTool[]> {
    const sessionStore = new SessionManager(this.dataDir);
    const capCtx: CapabilityBuildContext = {
      tenantId: this.tenantId,
      userId: this.userId,
      sessionId: this.sessionId,
      sessionRef: this.sessionRef,
      sessionStore,
    };

    return (
      await Promise.all([
        filesystem({ sandboxManager }).buildTools(capCtx),
        browser({ sandboxManager }).buildTools(capCtx),
        knowledge(knowledgeManager).buildTools(capCtx),
        askUser(waitHandleRegistry).buildTools(capCtx),
      ])
    ).flat();
  }

  buildTransformContext(): TransformContextFn {
    // Sub-agents don't need the full transform context that includes skills
    // They receive their context through the orchestration input mechanism
    return async (msgs) => msgs;
  }
}
