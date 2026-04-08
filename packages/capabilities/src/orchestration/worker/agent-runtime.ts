/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SessionRef } from "@agentrail/core";
import type { Message, RuntimeTool, TransformContextFn } from "@agentrail/core";
import type { CreateManagedAgentInput } from "@/orchestration/orchestration-manager.js";

/** Provider/model selection used by a sub-agent worker runtime. */
export interface ModelConfig {
  provider: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
}

/** Runtime adapter injected into the managed sub-agent worker process. */
export interface SubAgentRuntime {
  buildTools(input: CreateManagedAgentInput): Promise<RuntimeTool[]>;
  buildSystemPrompt(input: CreateManagedAgentInput): string;
  buildTransformContext?(
    tenantId: string,
    userId: string,
    sessionId: string,
    sessionRef: SessionRef,
  ): TransformContextFn;
  getModelConfig(): ModelConfig;
}

/** Worker-loop tuning knobs for managed sub-agent execution. */
export interface SubagentWorkerConfig {
  pollIntervalMs: number;
  fakeExecution: "" | "echo";
}

/** Serializable state held by the sub-agent worker between turns. */
export interface WorkerState {
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionRef: SessionRef;
  input: CreateManagedAgentInput;
  history: Message[];
  workerConfig: SubagentWorkerConfig;
}
