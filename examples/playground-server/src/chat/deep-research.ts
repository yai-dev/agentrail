/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { AgentrailChatHandledResponse, AgentrailResolvedChatContext } from "@agentrail/host";
import { runDeepResearchBlocking } from "@agentrail/deep-research";
import { config } from "../config.js";

export async function handlePlaygroundDeepResearchMode(
  context: AgentrailResolvedChatContext,
): Promise<AgentrailChatHandledResponse | null> {
  if (context.request.mode !== "deep_research") {
    return null;
  }

  const result = await runDeepResearchBlocking({
    tenantId: context.tenantId,
    userId: context.userId,
    query: context.request.message,
    sessionId: context.sessionId,
    sessionStore: context.sessionStore,
    runtime: {
      dataDir: config.dataDir,
      model: {
        provider: config.provider,
        modelId: config.modelId,
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      },
      searchProvider: config.searchProvider,
      tavilyApiKey: config.tavilyApiKey,
      sandbox: config.sandbox,
      orchestration: config.orchestration,
    },
  });

  return {
    body: {
      sessionId: result.sessionId,
      text: result.state.reportMarkdown,
      usage: { inputTokens: 0, outputTokens: 0 },
      stopReason: "stop",
    },
  };
}
