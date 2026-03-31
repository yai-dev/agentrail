/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { RuntimeTool, TransformContextFn } from "@agentrail/runtime-core";
import { buildDefaultCapabilityTools } from "@agentrail/host/defaults";
import type {
  CreateManagedAgentInput,
  SubAgentRuntime,
  ModelConfig,
} from "@agentrail/orchestration";

import { waitHandleRegistry } from "../wait-handle-registry.js";
import { config } from "../config.js";
import { buildSystemPrompt } from "../prompts/index.js";
import {
  knowledgeManager,
  sandboxManager,
} from "../context/index.js";

export interface DefaultSubAgentRuntimeConfig {
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionDir: string;
}

export class DefaultSubAgentRuntime implements SubAgentRuntime {
  private readonly tenantId: string;
  private readonly userId: string;
  private readonly sessionId: string;
  private readonly sessionDir: string;

  constructor(config: DefaultSubAgentRuntimeConfig) {
    this.tenantId = config.tenantId;
    this.userId = config.userId;
    this.sessionId = config.sessionId;
    this.sessionDir = config.sessionDir;
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
    const { executionTools, browserTools } = await buildDefaultCapabilityTools({
      tenantId: this.tenantId,
      userId: this.userId,
      sessionId: this.sessionId,
      sessionDir: this.sessionDir,
      knowledgeManager,
      sandboxManager,
      waitHandleRegistry,
      modelConfig: this.getModelConfig(),
      includeSkillTool: false,
    });

    return [...executionTools, ...browserTools];
  }

  buildTransformContext(): TransformContextFn {
    // Sub-agents don't need the full transform context that includes skills
    // They receive their context through the orchestration input mechanism
    return async (msgs) => msgs;
  }
}
