/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { RuntimeTool } from "@agentrail/runtime-core";
import { buildDefaultCapabilityTools } from "@agentrail/host/defaults";
import type { ExtendedSseEvent } from "@agentrail/skills";

import { waitHandleRegistry } from "../wait-handle-registry.js";
import { config } from "../config.js";
import {
  knowledgeManager,
  skillManager,
  sandboxManager,
} from "../context/index.js";

export function getModelConfig() {
  return {
    provider: config.provider,
    modelId: config.modelId,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
  };
}

/** @deprecated Use getModelConfig() instead */
export const modelConfig = getModelConfig();

export interface DefaultAgentTools {
  executionTools: RuntimeTool[];
  browserTools: RuntimeTool[];
  skillTool: RuntimeTool | null;
}

export async function buildDefaultAgentTools(
  tenantId: string,
  userId: string,
  sessionId: string,
  sessionDir: string,
  onSubAgentEvent?: (event: ExtendedSseEvent) => void,
  options: { includeSkillTool?: boolean } = {},
): Promise<DefaultAgentTools> {
  const { includeSkillTool = true } = options;
  return buildDefaultCapabilityTools({
    tenantId,
    userId,
    sessionId,
    sessionDir,
    knowledgeManager,
    sandboxManager,
    waitHandleRegistry,
    modelConfig: getModelConfig(),
    includeSkillTool,
    delegateSkillsToSubAgent: config.skillDelegateToSubAgent,
    skillManager,
    onSubAgentEvent,
  });
}
