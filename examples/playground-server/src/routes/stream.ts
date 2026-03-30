/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createStreamRoute } from "@agentrail/host";
import { DEFAULT_AGENT_ID } from "../agents/index.js";
import { buildSummarizeFn } from "../agents/summarizer.js";
import {
  buildContextProviders,
  getOrchestrationManager,
  sandboxManager,
  sessionManager,
} from "../context/index.js";
import { config } from "../config.js";
import { playgroundPlugins } from "../plugins/index.js";
import { resolvePlaygroundProfile } from "../profiles/default-profile.js";
import { handlePlaygroundDeepResearchModeStream } from "../chat/deep-research.js";

const summarize = buildSummarizeFn();

const stream = createStreamRoute({
  dataDir: config.dataDir,
  defaultAgentId: DEFAULT_AGENT_ID,
  sessionStore: sessionManager,
  sandboxManager,
  summarize,
  compaction: config.compaction,
  plugins: playgroundPlugins,
  resolveProfile: resolvePlaygroundProfile,
  getContextProviders: ({ tenantId, userId, sessionId }) =>
    buildContextProviders(tenantId, userId, sessionId),
  getOrchestrationManager: async ({ tenantId, userId, sessionId }) => {
    return getOrchestrationManager({
      tenantId,
      userId,
      sessionId,
      createManagedAgent: async () => {
        throw new Error("Direct agent creation is handled by the default profile");
      },
    });
  },
  handleResolvedRequest: handlePlaygroundDeepResearchModeStream,
});

export { stream };
