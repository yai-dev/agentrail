/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { AgentrailSessionStore } from "@agentrail/host";
import { createDefaultToolset } from "@agentrail/host/defaults";
import type { SessionRef } from "@agentrail/memo";
import {
  createCloseAgentTool,
  createSendInputTool,
  createSpawnAgentTool,
  createSubAgentProcess,
  createWaitAgentTool,
  type CreateManagedAgentInput,
  type ManagedAgentInstance,
} from "@agentrail/orchestration";
import { defineAgent } from "@agentrail/runtime-core";
import type { ExtendedSseEvent } from "@agentrail/skills";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { getOrchestrationManager } from "../context/index.js";
import { buildSystemPrompt } from "../prompts/index.js";
import { buildDefaultAgentTools, getModelConfig } from "./default-agent-tools.js";

export const DEFAULT_HOSTED_AGENT_ID = "agentrail-default-agent";

function getWorkerPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const extension = currentFile.endsWith(".ts") ? ".ts" : ".js";
  return join(dirname(currentFile), `default-subagent-worker-entry${extension}`);
}

async function createManagedDefaultAgentInstance(
  tenantId: string,
  userId: string,
  sessionId: string,
  sessionRef: SessionRef,
  input: CreateManagedAgentInput,
): Promise<ManagedAgentInstance> {
  return createSubAgentProcess({
    tenantId,
    userId,
    sessionId,
    sessionRef,
    dataDir: config.dataDir,
    input,
    workerPath: getWorkerPath(),
    runtimeConfig: { input },
    workerConfig: config.orchestration.subagent,
  });
}

export async function createDefaultAgent(
  tenantId: string,
  userId: string,
  sessionId: string,
  sessionRef: SessionRef,
  sessionStore: AgentrailSessionStore,
  onSubAgentEvent?: (event: ExtendedSseEvent) => void,
) {
  const { executionTools, browserTools, skillTool } = await buildDefaultAgentTools(
    tenantId,
    userId,
    sessionId,
    sessionRef,
    sessionStore,
    onSubAgentEvent,
  );
  const orchestrationManager = await getOrchestrationManager({
    tenantId,
    userId,
    sessionId,
    sessionRef,
    createManagedAgent: (input) =>
      createManagedDefaultAgentInstance(tenantId, userId, sessionId, sessionRef, input),
  });
  const orchestrationRunId = `orchestration:${sessionId}`;
  const orchestrationTools = [
    createSpawnAgentTool(orchestrationManager, orchestrationRunId),
    createSendInputTool(orchestrationManager),
    createWaitAgentTool(orchestrationManager),
    createCloseAgentTool(orchestrationManager),
  ];

  return defineAgent({
    id: DEFAULT_HOSTED_AGENT_ID,
    name: "Agentrail Playground Assistant",
    model: getModelConfig(),
    system: buildSystemPrompt(),
    tools: createDefaultToolset({
      executionTools,
      browserTools,
      orchestrationTools,
      optionalTools: [skillTool],
    }),
    maxTokens: 8192,
    maxTurns: 20,
  });
}
