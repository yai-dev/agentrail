/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { KnowledgeManager } from "@agentrail/knowledge";
import { SessionManager } from "@agentrail/memo";
import { SandboxManager } from "@agentrail/sandbox";
import { config } from "../config.js";

export const sessionManager = new SessionManager(config.dataDir);
export const knowledgeManager = new KnowledgeManager(config.dataDir);
export const sandboxManager = new SandboxManager(config.dataDir, config.sandbox);
