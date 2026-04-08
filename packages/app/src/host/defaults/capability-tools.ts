/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createKbListTool, createKbReadTool, createKbSearchTool } from "@agentrail/capabilities";
import {
  createBrowserAction,
  createBrowserContent,
  createBrowserNavigate,
  createBrowserScroll,
  createSandboxedBash,
  createSandboxedEdit,
  createSandboxedGrep,
  createSandboxedRead,
  createSandboxedWrite,
} from "@agentrail/capabilities";
import { buildSkillTool } from "@agentrail/capabilities";
import { createAskUserQuestionTool, createTodoWriteTool } from "@agentrail/capabilities";
import type { DefaultCapabilityToolOptions, DefaultCapabilityTools } from "@/host/defaults/shared-types.js";

/**
 * Builds the default capability toolset used by the reference host and examples.
 *
 * @deprecated Use capability descriptors instead:
 * ```ts
 * import { filesystem, browser, knowledge, skills, askUser, orchestration, memoryContext } from "@agentrail/capabilities";
 * import { createOrchestrationRegistry } from "@agentrail/app";
 *
 * const orchestrationRegistry = createOrchestrationRegistry({ dataDir });
 *
 * defineProfile({
 *   capabilities: [
 *     filesystem({ sandboxManager }),
 *     browser({ sandboxManager }),
 *     knowledge(knowledgeManager),
 *     skills(skillManager),
 *     askUser(waitHandleRegistry),
 *     orchestration(orchestrationRegistry, (input, ctx) =>
 *       createSubAgentProcess({ ...ctx, input, workerPath: WORKER_PATH }),
 *     ),
 *     memoryContext({ buildMemoryIndex: (ctx) => sessionManager.buildMemoryIndex(...ctx) }),
 *   ],
 * });
 * ```
 */
export async function buildDefaultCapabilityTools(
  options: DefaultCapabilityToolOptions,
): Promise<DefaultCapabilityTools> {
  const {
    tenantId,
    userId,
    sessionId,
    sessionRef,
    sessionStore,
    knowledgeManager,
    sandboxManager,
    waitHandleRegistry,
    modelConfig,
    includeSkillTool = true,
    delegateSkillsToSubAgent = true,
    skillManager,
    onSubAgentEvent,
    containerSkillsDir = "/skills",
  } = options;

  const todoStorage = sessionStore.createTodoStorage?.(sessionRef);
  if (!todoStorage) {
    throw new Error("Session store does not implement createTodoStorage(sessionRef)");
  }

  const kbTools = [
    createKbListTool(knowledgeManager, tenantId),
    createKbReadTool(knowledgeManager, tenantId),
    createKbSearchTool(knowledgeManager, tenantId),
  ];

  const sandboxFileTools = [
    createSandboxedBash(sandboxManager, sessionId, tenantId, userId),
    createSandboxedRead(sandboxManager, sessionId, tenantId, userId),
    createSandboxedWrite(sandboxManager, sessionId, tenantId, userId),
    createSandboxedEdit(sandboxManager, sessionId, tenantId, userId),
    createSandboxedGrep(sandboxManager, sessionId, tenantId, userId),
  ];

  const browserTools = [
    createBrowserNavigate(sandboxManager, sessionId, tenantId, userId),
    createBrowserScroll(sandboxManager, sessionId, tenantId, userId),
    createBrowserAction(sandboxManager, sessionId, tenantId, userId),
    createBrowserContent(sandboxManager, sessionId, tenantId, userId),
  ];

  const executionTools = [
    ...sandboxFileTools,
    createTodoWriteTool(todoStorage),
    createAskUserQuestionTool(sessionId, waitHandleRegistry),
    ...kbTools,
  ];

  const skillTool =
    includeSkillTool && skillManager
      ? await buildSkillTool(
          skillManager,
          modelConfig,
          executionTools,
          onSubAgentEvent,
          delegateSkillsToSubAgent,
          containerSkillsDir,
          (entry) => sessionStore.persistSkillSubAgentLog?.(sessionRef, entry),
          { tenantId, userId },
        )
      : null;

  return {
    executionTools,
    browserTools,
    skillTool,
  };
}
