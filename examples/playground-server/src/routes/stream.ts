/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { DEFAULT_AGENT_ID } from "@/agents/index.js";
import { buildSummarizeFn } from "@/agents/summarizer.js";
import { handlePlaygroundDeepResearchModeStream } from "@/chat/deep-research.js";
import { config } from "@/config.js";
import { orchestrationRegistry, sandboxManager, sessionManager } from "@/context/index.js";
import { playgroundPlugins } from "@/plugins/index.js";
import { resolvePlaygroundProfile } from "@/profiles/default-profile.js";
import type { WorkflowTraceEventEnvelope } from "@agentrail/app";
import { createFileSystemSessionTraceStore } from "@agentrail/app";
import { createStreamRoute } from "@agentrail/app/advanced";

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
  getOrchestrationManager: ({ tenantId, userId, sessionId, sessionRef }) =>
    orchestrationRegistry.getManager({ tenantId, userId, sessionId, sessionRef }),
  handleResolvedRequest: handlePlaygroundDeepResearchModeStream,
  permissionPolicy: config.permissionPolicy,
  onTraceEvent: (ctx, envelope) => {
    const traceStore = createFileSystemSessionTraceStore<WorkflowTraceEventEnvelope>(
      config.dataDir,
      ctx.sessionRef,
    );
    void traceStore.appendEnvelope(envelope);
  },
});

export { stream };
