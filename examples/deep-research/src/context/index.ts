/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { KnowledgeManager } from "@agentrail/capabilities";
import { SessionManager } from "@agentrail/app";
import { SandboxManager } from "@agentrail/capabilities";
import { config } from "../config.js";

export const sessionManager = new SessionManager(config.dataDir);
export const knowledgeManager = new KnowledgeManager(config.dataDir);
export const sandboxManager = new SandboxManager(config.dataDir, config.sandbox);
