/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SessionRef } from "@agentrail/core";
import { initializeWorker } from "@agentrail/capabilities/orchestration/worker";
import "@agentrail/core/providers";
import { DefaultSubAgentRuntime } from "./default-subagent-runtime.js";

interface WorkerInitPayload {
  type: "init";
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionRef: SessionRef;
  dataDir: string;
}

function isInitMessage(message: unknown): message is WorkerInitPayload {
  return Boolean(
    message &&
    typeof message === "object" &&
    "type" in message &&
    (message as { type?: unknown }).type === "init" &&
    "tenantId" in message &&
    "userId" in message &&
    "sessionId" in message &&
    "sessionRef" in message &&
    "dataDir" in message,
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
    runtime: new DefaultSubAgentRuntime({
      tenantId: message.tenantId,
      userId: message.userId,
      sessionId: message.sessionId,
      sessionRef: message.sessionRef,
      dataDir: message.dataDir,
    }),
  });

  // Re-emit the init payload after the generic worker listener is attached so
  // the standard init -> ready flow still happens inside initializeWorker().
  queueMicrotask(() => {
    emitProcessMessage("message", message);
  });
});
