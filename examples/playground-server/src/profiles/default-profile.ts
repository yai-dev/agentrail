/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import {
  createHostedProfileResolver,
  defineHostedProfile,
} from "@agentrail/host/defaults";
import type { ExtendedSseEvent } from "@agentrail/skills";
import { buildSystemPrompt } from "../prompts/index.js";
import { DEFAULT_AGENT_ID, getAgent } from "../agents/index.js";

export const playgroundDefaultProfile = defineHostedProfile({
  id: DEFAULT_AGENT_ID,
  name: "Agentrail Playground Assistant",
  promptBuilder: async () => buildSystemPrompt(),
  createAgent: async (context, onSubAgentEvent) => {
    const agent = await getAgent(
      DEFAULT_AGENT_ID,
      context.tenantId,
      context.userId,
      context.sessionId,
      context.sessionDir,
      onSubAgentEvent
        ? (event: ExtendedSseEvent) => onSubAgentEvent(event)
        : undefined,
    );
    if (!agent) {
      throw new Error(`Agent '${DEFAULT_AGENT_ID}' not found`);
    }
    return agent;
  },
});

export const resolvePlaygroundProfile = createHostedProfileResolver([
  playgroundDefaultProfile,
]);
