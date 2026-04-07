/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { TransformContextFn, UserMessage } from "@agentrail/core";
import { createContextProviderFromTransform } from "../context-pipeline.js";
import type { ContextProvider } from "../types.js";
import {
  makeDateContextMessage,
  makeKnowledgeContextMessage,
  makeMemoryIndexMessage,
  makeSkillsContextMessage,
  makeUserIdentityMessage,
  translateMemoryPaths,
} from "./capability-messages.js";
import type { DefaultCapabilityContextOptions } from "./shared-types.js";
import { createDefaultContextProviders } from "./toolset.js";

/**
 * Creates the default transformContext implementation used by the recommended host SDK.
 */
export function createDefaultCapabilityTransformContext(
  options: DefaultCapabilityContextOptions,
): TransformContextFn {
  const {
    tenantId,
    userId,
    sessionId,
    includeSkillsContext = true,
    delegateSkillsToSubAgent,
    cacheTtlMs = 5_000,
    buildMemoryIndex,
    listKnowledgeMetadatas,
    listSkills,
    listWorkspaceSnapshot,
    compactMessages = (messages) => messages,
  } = options;

  let cachedContextMsgs: UserMessage[] | null = null;
  let cacheExpiry = 0;

  return async (messages) => {
    const now = Date.now();

    if (!cachedContextMsgs || now > cacheExpiry) {
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

      cachedContextMsgs = built;
      cacheExpiry = now + cacheTtlMs;
    }

    return [...cachedContextMsgs, ...compactMessages(messages)];
  };
}

/**
 * Creates default context providers by adapting the capability transform into provider form.
 */
export function createDefaultCapabilityContextProviders(
  options: DefaultCapabilityContextOptions,
): ContextProvider[] {
  return createDefaultContextProviders({
    baseProviders: [
      createContextProviderFromTransform(createDefaultCapabilityTransformContext(options)),
    ],
  });
}
