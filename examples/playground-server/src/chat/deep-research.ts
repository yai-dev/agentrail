/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import {
  runDeepResearchBlocking,
  runDeepResearchStreaming,
  type DeepResearchStreamingRunInput,
} from "@agentrail/deep-research";
import type {
  AgentrailChatHandledResponse,
  AgentrailResolvedChatContext,
  AgentrailResolvedStreamContext,
} from "@agentrail/app";
import type { Message, Usage } from "@agentrail/core";
import { config } from "../config.js";

function buildDeepResearchRuntime() {
  return {
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
  };
}

function zeroUsage(): Usage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function buildDeepResearchFailureTurn(
  userText: string,
  errorMessage: string,
): { messages: Message[]; usage: Usage } {
  const timestamp = Date.now();
  const usage = zeroUsage();
  return {
    messages: [
      {
        role: "user",
        content: userText,
        timestamp,
      },
      {
        role: "assistant",
        content: [{ type: "text", text: `Deep Research failed: ${errorMessage}` }],
        provider: config.provider,
        modelId: config.modelId,
        usage,
        stopReason: "error",
        timestamp: timestamp + 1,
      },
    ],
    usage,
  };
}

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
    runtime: buildDeepResearchRuntime(),
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

export function createPlaygroundDeepResearchModeStreamHandler(
  runStreaming: typeof runDeepResearchStreaming = runDeepResearchStreaming,
) {
  return async function handlePlaygroundDeepResearchModeStream(
    context: AgentrailResolvedStreamContext,
  ): Promise<boolean> {
    if (context.request.mode !== "deep_research") {
      return false;
    }

    try {
      await runStreaming({
        tenantId: context.tenantId,
        userId: context.userId,
        query: context.request.message,
        sessionId: context.sessionId,
        sessionStore: context.sessionStore,
        persistTurn: context.persistTurn,
        runtime: buildDeepResearchRuntime(),
        onEvent: context.writeEvent,
      } satisfies DeepResearchStreamingRunInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failureTurn = buildDeepResearchFailureTurn(context.request.message, message);
      await context.writeEvent({
        type: "error",
        error: { message },
      });
      await context.persistTurn(failureTurn.messages, failureTurn.usage);
    }

    return true;
  };
}

export const handlePlaygroundDeepResearchModeStream =
  createPlaygroundDeepResearchModeStreamHandler();
