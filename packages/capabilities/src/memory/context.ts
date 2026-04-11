/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import {
  makeDateContextMessage,
  makeKnowledgeContextMessage,
  makeMemoryIndexMessage,
  makeSkillsContextMessage,
  makeUserIdentityMessage,
  translateMemoryPaths,
} from "@/memory/messages.js";
import type { DefaultCapabilityContextOptions } from "@/memory/types.js";
import { createDefaultContextProviders } from "@/memory/types.js";
import type { ContextProvider, TransformContextFn, UserMessage } from "@agentrail/core";

export interface DefaultCapabilityContextState {
  cachedContextMsgs: UserMessage[] | null;
  cacheExpiry: number;
  capturedSessionDir?: string;
}

export function createDefaultCapabilityContextState(): DefaultCapabilityContextState {
  return {
    cachedContextMsgs: null,
    cacheExpiry: 0,
    capturedSessionDir: undefined,
  };
}

async function ensureCachedContextMessages(
  options: DefaultCapabilityContextOptions,
  state: DefaultCapabilityContextState,
): Promise<UserMessage[]> {
  const {
    tenantId,
    userId,
    includeSkillsContext = true,
    delegateSkillsToSubAgent,
    cacheTtlMs = 5_000,
    buildMemoryIndex,
    listKnowledgeMetadatas,
    listSkills,
    listWorkspaceSnapshot,
  } = options;

  const now = Date.now();
  if (state.cachedContextMsgs && now <= state.cacheExpiry) {
    return state.cachedContextMsgs;
  }

  const [rawIndex, knowledgeMetas, skills] = await Promise.all([
    buildMemoryIndex(),
    listKnowledgeMetadatas(),
    includeSkillsContext ? listSkills() : Promise.resolve([]),
  ]);

  const built: UserMessage[] = [
    makeUserIdentityMessage(tenantId, userId, now),
    makeDateContextMessage(now),
    makeMemoryIndexMessage(translateMemoryPaths(rawIndex), now),
  ];

  const knowledgeMsg = makeKnowledgeContextMessage(knowledgeMetas, now);
  if (knowledgeMsg) {
    built.push(knowledgeMsg);
  }

  const skillsMsg = includeSkillsContext
    ? makeSkillsContextMessage(skills, delegateSkillsToSubAgent, now)
    : null;
  if (skillsMsg) {
    built.push(skillsMsg);
  }

  if (listWorkspaceSnapshot) {
    try {
      const workspaceSnapshot = await listWorkspaceSnapshot();
      if (workspaceSnapshot) {
        built.push({
          role: "user",
          content: `[Sandbox Workspace]\n${workspaceSnapshot}`,
          timestamp: now,
        });
      }
    } catch {
      // The sandbox may not exist yet for the current session.
    }
  }

  state.capturedSessionDir = rawIndex.sessionDir;
  state.cachedContextMsgs = built;
  state.cacheExpiry = now + cacheTtlMs;

  return built;
}

/**
 * Creates the default transformContext implementation used by the recommended host SDK.
 */
export function createDefaultCapabilityTransformContext(
  options: DefaultCapabilityContextOptions,
  state: DefaultCapabilityContextState = createDefaultCapabilityContextState(),
): TransformContextFn {
  const { compactMessages = (messages, _ctx) => messages } = options;

  return async (messages) => {
    await ensureCachedContextMessages(options, state);
    return Promise.resolve(compactMessages(messages, { sessionDir: state.capturedSessionDir }));
  };
}

/**
 * Creates default context providers for injected session context.
 */
export function createDefaultCapabilityContextProviders(
  options: DefaultCapabilityContextOptions,
  state: DefaultCapabilityContextState = createDefaultCapabilityContextState(),
): ContextProvider[] {
  return createDefaultContextProviders({
    baseProviders: [async () => ensureCachedContextMessages(options, state)],
  });
}
