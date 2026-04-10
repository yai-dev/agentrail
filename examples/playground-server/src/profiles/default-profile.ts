/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { compactToolResults, createStaticProfileResolver, defineProfile } from "@agentrail/app";
import {
  askUser,
  browser,
  createSubAgentProcess,
  filesystem,
  knowledge,
  memoryContext,
  orchestration,
  skills,
} from "@agentrail/capabilities";
import { config } from "@/config.js";
import {
  knowledgeManager,
  orchestrationRegistry,
  sandboxManager,
  sessionManager,
  skillManager,
} from "@/context/index.js";
import { waitHandleRegistry } from "@/wait-handle-registry.js";
import { buildSystemPrompt } from "@/prompts/index.js";
import { getWorkerPath } from "@/agents/worker-path.js";

export const DEFAULT_HOSTED_AGENT_ID = "agentrail-default-agent";

export const defaultProfile = defineProfile({
  id: DEFAULT_HOSTED_AGENT_ID,
  name: "Agentrail Playground Assistant",
  agent: {
    model: `${config.provider}:${config.modelId}`,
    prompt: () => buildSystemPrompt(),
  },
  modelConfig: config.baseUrl ? { baseUrl: config.baseUrl } : undefined,
  capabilities: [
    filesystem({ sandboxManager }),
    browser({ sandboxManager }),
    knowledge(knowledgeManager),
    skills(skillManager, {
      mode: config.skillDelegateToSubAgent ? "delegate" : "inline",
    }),
    askUser(waitHandleRegistry),
    orchestration(orchestrationRegistry, (input, ctx) =>
      createSubAgentProcess({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        sessionRef: ctx.sessionRef,
        dataDir: config.dataDir,
        input,
        workerPath: getWorkerPath(),
        runtimeConfig: { input },
        workerConfig: config.orchestration.subagent,
      }),
    ),
    memoryContext(
      {
        buildMemoryIndex: (ctx) =>
          sessionManager.buildMemoryIndex(ctx.tenantId, ctx.userId, ctx.sessionId),
        listKnowledgeMetadatas: async (ctx) => {
          const kbList = await knowledgeManager.listKbs(ctx.tenantId);
          return Promise.all(kbList.map((id) => knowledgeManager.getMetadata(ctx.tenantId, id)));
        },
        listSkills: () => skillManager.listSkills(),
        listWorkspaceSnapshot: (ctx) => sandboxManager.listWorkspace(ctx.sessionId),
        compactMessages: (msgs, ctx) =>
          compactToolResults(msgs, { sessionDir: ctx?.sessionDir }),
        delegateSkillsToSubAgent: config.skillDelegateToSubAgent,
      },
      { cacheTtlMs: 5_000 },
    ),
  ],
});

export const playgroundDefaultProfile = defaultProfile;

export const resolvePlaygroundProfile = createStaticProfileResolver([defaultProfile]);
