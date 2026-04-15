/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// Register built-in LLM providers (Anthropic, OpenAI) as side effects
import "@agentrail/core/providers";

import { createAgentApp } from "@agentrail/app";
import { serve } from "@hono/node-server";
import { buildSummarizeFn, defaultProfile } from "./agent.js";
import { createObservabilityPlugin } from "./plugin.js";

const app = createAgentApp({
  dataDir: process.env.DATA_DIR ?? "./data",
  profiles: [defaultProfile],
  summarize: buildSummarizeFn(),
  plugins: [createObservabilityPlugin()],
  compaction: {
    triggerTokens: 40_000,
    minMessages: 10,
  },
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) => {
  console.log(`with-custom-hooks server running on http://localhost:${info.port}`);
});
