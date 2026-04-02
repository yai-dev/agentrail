/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createStreamRoute } from "@agentrail/host";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_AGENT_ID } from "../agents/index.js";
import { buildSummarizeFn } from "../agents/summarizer.js";
import { handlePlaygroundDeepResearchModeStream } from "../chat/deep-research.js";
import { config } from "../config.js";
import {
  buildContextProviders,
  getOrchestrationManager,
  sandboxManager,
  sessionManager,
} from "../context/index.js";
import { playgroundPlugins } from "../plugins/index.js";
import { resolvePlaygroundProfile } from "../profiles/default-profile.js";

const summarize = buildSummarizeFn();

const stream = createStreamRoute({
  dataDir: config.dataDir,
  defaultAgentId: DEFAULT_AGENT_ID,
  sessionStore: sessionManager,
  sandboxManager,
  summarize,
  compaction: config.compaction,
  plugins: playgroundPlugins,
  resolveProfile: resolvePlaygroundProfile,
  getContextProviders: ({ tenantId, userId, sessionId }) =>
    buildContextProviders(tenantId, userId, sessionId),
  getOrchestrationManager: async ({ tenantId, userId, sessionId, sessionRef }) => {
    return getOrchestrationManager({
      tenantId,
      userId,
      sessionId,
      sessionRef,
      createManagedAgent: async () => {
        throw new Error("Direct agent creation is handled by the default profile");
      },
    });
  },
  handleResolvedRequest: handlePlaygroundDeepResearchModeStream,
  onTraceEvent: (ctx, envelope) => {
    const { tenantId, sessionId } = sessionManager.resolveSessionRef(ctx.sessionRef);
    const traceDir = sessionManager.getTraceDir(tenantId, sessionId);
    void mkdir(traceDir, { recursive: true }).then(() =>
      appendFile(path.join(traceDir, "events.jsonl"), `${JSON.stringify(envelope)}\n`, "utf8"),
    );
  },
});

export { stream };
