/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createDeepResearchRunRoute } from "@agentrail/deep-research";
import { config } from "../config.js";
import { sessionManager } from "../context/index.js";

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
    sandbox: config.sandbox,
    orchestration: config.orchestration,
  },
});

export { run };
