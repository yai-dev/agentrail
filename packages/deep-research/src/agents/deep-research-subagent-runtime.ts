/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { RuntimeTool, TransformContextFn } from "@agentrail/runtime-core";
import type {
  CreateManagedAgentInput,
  ModelConfig,
  SubAgentRuntime,
} from "@agentrail/orchestration";
import { createSandboxedPython, SandboxManager } from "@agentrail/sandbox";
import {
  createKbListTool,
  createKbReadTool,
  createKbSearchTool,
  KnowledgeManager,
} from "@agentrail/knowledge";
import type { DeepResearchRuntimeConfig } from "../runtime.js";
import { getRolePrompt } from "../prompts.js";
import { createFetchUrlTool, createWebSearchTool } from "../tools.js";

export interface DeepResearchSubAgentRuntimeConfig {
  tenantId: string;
  userId: string;
  sessionId: string;
  runtime: DeepResearchRuntimeConfig;
}

// This runtime adapts the generic managed-subagent worker to Deep Research's
// role system. Each role gets a purpose-built system prompt and only the tools
// it actually needs.
export class DeepResearchSubAgentRuntime implements SubAgentRuntime {
  private readonly knowledgeManager: KnowledgeManager;
  private readonly sandboxManager: SandboxManager;

  constructor(private readonly runtimeConfig: DeepResearchSubAgentRuntimeConfig) {
    this.knowledgeManager = new KnowledgeManager(runtimeConfig.runtime.dataDir);
    this.sandboxManager = new SandboxManager(
      runtimeConfig.runtime.dataDir,
      runtimeConfig.runtime.sandbox,
    );
  }

  getModelConfig(): ModelConfig {
    return this.runtimeConfig.runtime.model;
  }

  buildSystemPrompt(input: CreateManagedAgentInput): string {
    const currentDate = new Date().toISOString().slice(0, 10);
    const rolePrompt = getRolePrompt(input.role as "researcher" | "analyst" | "coder", currentDate);
    return [
      rolePrompt,
      "[Deep Research Sub-Agent Context]",
      `agent_id: ${input.agentId}`,
      `run_id: ${input.runId}`,
      `task_id: ${input.taskId}`,
      `assigned_role: ${input.role}`,
      "You are not allowed to spawn more agents.",
      "Return only the format requested in your role prompt.",
    ].join("\n\n");
  }

  async buildTools(input: CreateManagedAgentInput): Promise<RuntimeTool[]> {
    // Researchers get web + KB tools, coders get Python, and analysts stay
    // intentionally tool-light so synthesis happens from the curated state.
    const kbTools = [
      createKbListTool(this.knowledgeManager, this.runtimeConfig.tenantId),
      createKbReadTool(this.knowledgeManager, this.runtimeConfig.tenantId),
      createKbSearchTool(this.knowledgeManager, this.runtimeConfig.tenantId),
    ];

    if (input.role === "researcher") {
      return [createWebSearchTool(this.runtimeConfig.runtime), createFetchUrlTool(), ...kbTools];
    }

    if (input.role === "coder") {
      return [
        createSandboxedPython(
          this.sandboxManager,
          this.runtimeConfig.sessionId,
          this.runtimeConfig.tenantId,
          this.runtimeConfig.userId,
        ),
      ];
    }

    return [];
  }

  buildTransformContext(): TransformContextFn {
    return async (messages) => messages;
  }
}
