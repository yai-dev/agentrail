/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { config } from "@/config.js";
import { sessionManager } from "@/context/index.js";
import { createDeepResearchRunRoute } from "@agentrail/deep-research";

const run = createDeepResearchRunRoute({
  sessionStore: sessionManager,
  runtime: {
    dataDir: config.dataDir,
    model: {
      provider: config.provider,
      modelId: config.modelId,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    },
    searchProvider: config.searchProvider,
    tavilyApiKey: config.tavilyApiKey,
    braveApiKey: config.braveApiKey,
    jinaApiKey: config.jinaApiKey,
    exaApiKey: config.exaApiKey,
    sandbox: config.sandbox,
    orchestration: config.orchestration,
  },
});

export { run };
