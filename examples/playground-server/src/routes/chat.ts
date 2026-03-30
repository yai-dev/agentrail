/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createChatRoute } from "@agentrail/host";
import { DEFAULT_AGENT_ID } from "../agents/index.js";
import { buildContextProviders, sessionManager } from "../context/index.js";
import { playgroundPlugins } from "../plugins/index.js";
import { resolvePlaygroundProfile } from "../profiles/default-profile.js";
import { handlePlaygroundDeepResearchMode } from "../chat/deep-research.js";

const chat = createChatRoute({
  defaultAgentId: DEFAULT_AGENT_ID,
  sessionStore: sessionManager,
  plugins: playgroundPlugins,
  resolveProfile: resolvePlaygroundProfile,
  getContextProviders: ({ tenantId, userId, sessionId }) =>
    buildContextProviders(tenantId, userId, sessionId),
  handleResolvedRequest: handlePlaygroundDeepResearchMode,
});

export { chat };
