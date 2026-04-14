/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// Register built-in LLM providers (Anthropic, OpenAI) as side effects
import "@agentrail/core/providers";

import { createAgentApp } from "@agentrail/app";
import { serve } from "@hono/node-server";
import { buildSummarizeFn, defaultProfile, skillManager } from "./agent.js";

async function main() {
  const registeredSkills = await skillManager.listSkills();
  console.log(
    `Loaded ${registeredSkills.length} skill(s): ${registeredSkills.map((s) => s.name).join(", ") || "(none)"}`,
  );

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
    console.log(`with-custom-skills server running on http://localhost:${info.port}`);
  });
}

main();
