/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createDeepResearchRoute } from "@agentrail/deep-research";
import { config } from "../config.js";

const deepResearch = createDeepResearchRoute({
  dataDir: config.dataDir,
});

export { deepResearch };
