/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { AgentrailSessionStore } from "@agentrail/host";
import { buildDefaultCapabilityTools } from "@agentrail/host/defaults";
import type { SessionRef } from "@agentrail/memo";
import type { RuntimeTool } from "@agentrail/runtime-core";
import type { ExtendedSseEvent } from "@agentrail/skills";

import { config } from "../config.js";
import { knowledgeManager, sandboxManager, skillManager } from "../context/index.js";
import { waitHandleRegistry } from "../wait-handle-registry.js";

export function getModelConfig() {
  return {
    provider: config.provider,
    modelId: config.modelId,
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
  sessionRef: SessionRef,
  sessionStore: AgentrailSessionStore,
  onSubAgentEvent?: (event: ExtendedSseEvent) => void,
  options: { includeSkillTool?: boolean } = {},
): Promise<DefaultAgentTools> {
  const { includeSkillTool = true } = options;
  return buildDefaultCapabilityTools({
    tenantId,
    userId,
    sessionId,
    sessionRef,
    sessionStore,
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
