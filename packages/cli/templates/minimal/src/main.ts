// Register built-in LLM providers (Anthropic, OpenAI) as side effects
import "@agentrail/core/providers";

import { createAgentApp } from "@agentrail/app";
import { serve } from "@hono/node-server";
import { buildSummarizeFn, defaultProfile } from "./agent.js";

const app = createAgentApp({
  dataDir: process.env.DATA_DIR ?? "./data",
  profiles: [defaultProfile],
  summarize: buildSummarizeFn(),
  compaction: {
    triggerTokens: 40_000,
    minMessages: 10,
  },
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) => {
  console.log(`{{PROJECT_NAME}} server running on http://localhost:${info.port}`);
});
