/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// Register built-in LLM providers (Anthropic, OpenAI) as side effects
import "@agentrail/core/providers";

import { createAgentApp, runPluginLifecycle } from "@agentrail/app";
import { serve } from "@hono/node-server";
import { buildSummarizeFn, defaultProfile } from "./agent.js";
import { createCapabilityPlugin } from "./plugin.js";

const plugins = [createCapabilityPlugin()];

const app = createAgentApp({
  dataDir: process.env.DATA_DIR ?? "./data",
  profiles: [defaultProfile],
  summarize: buildSummarizeFn(),
  plugins,
  compaction: {
    triggerTokens: 40_000,
    minMessages: 10,
  },
});

void runPluginLifecycle(plugins, "start");

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) => {
  console.log(`with-custom-plugins server running on http://localhost:${info.port}`);
});

async function onShutdown() {
  await runPluginLifecycle(plugins, "stop").catch(() => {});
  process.exit(0);
}

process.on("SIGINT", () => void onShutdown());
process.on("SIGTERM", () => void onShutdown());
