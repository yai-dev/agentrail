/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { config } from "@/config.js";
import { createDeepResearchRoute } from "@agentrail/deep-research";

const deepResearch = createDeepResearchRoute({
  dataDir: config.dataDir,
});

export { deepResearch };
