/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createChatRoute } from "@agentrail/app/advanced";
import { DEFAULT_AGENT_ID } from "@/agents/index.js";
import { buildSummarizeFn } from "@/agents/summarizer.js";
import { handlePlaygroundDeepResearchMode } from "@/chat/deep-research.js";
import { config } from "@/config.js";
import { sessionManager } from "@/context/index.js";
import { playgroundPlugins } from "@/plugins/index.js";
import { resolvePlaygroundProfile } from "@/profiles/default-profile.js";

const summarize = buildSummarizeFn();

const chat = createChatRoute({
  defaultAgentId: DEFAULT_AGENT_ID,
  sessionStore: sessionManager,
  summarize,
  compaction: config.compaction,
  plugins: playgroundPlugins,
  resolveProfile: resolvePlaygroundProfile,
  handleResolvedRequest: handlePlaygroundDeepResearchMode,
});

export { chat };
