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
import { waitHandleRegistry } from "@/wait-handle-registry.js";
import type { WorkflowTraceEventEnvelope } from "@agentrail/app";
import { createFileSystemSessionTraceStore } from "@agentrail/app";
import { createStreamRoute } from "@agentrail/app/advanced";
import type { SessionRef } from "@agentrail/core";

const summarize = buildSummarizeFn();

// Cache trace stores by sessionRef so we open the trace file once per session
// rather than on every envelope.
const traceStoreCache = new Map<
  SessionRef,
  ReturnType<typeof createFileSystemSessionTraceStore<WorkflowTraceEventEnvelope>>
>();
function getTraceStore(sessionRef: SessionRef) {
  let store = traceStoreCache.get(sessionRef);
  if (!store) {
    store = createFileSystemSessionTraceStore<WorkflowTraceEventEnvelope>(
      config.dataDir,
      sessionRef,
    );
    traceStoreCache.set(sessionRef, store);
  }
  return store;
}

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
  createPermissionApprovalHandler: (sessionId) => ({
    requestApproval({ toolCallId, toolName, reason, signal }) {
      return Promise.race([
        waitHandleRegistry.registerPermission(sessionId, toolCallId, toolName, reason),
        new Promise<never>((_resolve, reject) => {
          signal?.addEventListener("abort", () =>
            reject(new Error("Request aborted while waiting for permission approval")),
          );
        }),
      ]);
    },
  }),
  onTraceEvent: (ctx, envelope) => {
    void getTraceStore(ctx.sessionRef).appendEnvelope(envelope);
  },
});

export { stream };
