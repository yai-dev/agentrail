/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { initializeWorker } from "@agentrail/capabilities/orchestration/worker";
import "@agentrail/core/providers";
import type { DeepResearchRuntimeConfig } from "@/runtime.js";
import { DeepResearchSubAgentRuntime } from "@/agents/deep-research-subagent-runtime.js";

interface WorkerInitPayload {
  type: "init";
  tenantId: string;
  userId: string;
  sessionId: string;
  runtimeConfig?: {
    runtime?: DeepResearchRuntimeConfig;
  };
}

function isInitMessage(message: unknown): message is WorkerInitPayload {
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    (message as { type?: unknown }).type === "init" &&
    "tenantId" in message &&
    "userId" in message &&
    "sessionId" in message,
  );
}

let workerInitialized = false;
const emitProcessMessage = process.emit.bind(process) as (
  event: string,
  ...args: unknown[]
) => boolean;

process.on("message", (message) => {
  if (!isInitMessage(message) || workerInitialized) {
    return;
  }

  workerInitialized = true;
  initializeWorker({
    runtime: new DeepResearchSubAgentRuntime({
      tenantId: message.tenantId,
      userId: message.userId,
      sessionId: message.sessionId,
      runtime: message.runtimeConfig?.runtime ?? {
        dataDir: "",
        model: {
          provider: "anthropic",
          modelId: "claude-sonnet-4-5",
        },
      },
    }),
  });

  // Re-emit the init payload after the generic worker has registered its own
  // message listener so it can complete the normal init -> ready handshake.
  queueMicrotask(() => {
    emitProcessMessage("message", message);
  });
});
