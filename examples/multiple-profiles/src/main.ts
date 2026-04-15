/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// Register built-in LLM providers (Anthropic, OpenAI) as side effects
import "@agentrail/core/providers";

import { createAgentApp } from "@agentrail/app";
import { serve } from "@hono/node-server";
import { codingProfile, generalProfile, researchProfile } from "./profiles.js";
import { buildSummarizeFn } from "./summarizer.js";

const app = createAgentApp({
  dataDir: process.env.DATA_DIR ?? "./data",
  profiles: [generalProfile, codingProfile, researchProfile],
  summarize: buildSummarizeFn(),
  compaction: {
    triggerTokens: 40_000,
    minMessages: 10,
  },
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) => {
  console.log(`multiple-profiles server running on http://localhost:${info.port}`);
  console.log("Available profiles: general-agent, coding-agent, research-agent");
});
