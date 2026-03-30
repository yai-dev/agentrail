/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Message, RuntimeTool, TransformContextFn } from "@agentrail/runtime-core";
import type { CreateManagedAgentInput } from "../orchestration-manager.js";

export interface ModelConfig {
  provider: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface SubAgentRuntime {
  buildTools(input: CreateManagedAgentInput): Promise<RuntimeTool[]>;
  buildSystemPrompt(input: CreateManagedAgentInput): string;
  buildTransformContext?(
    tenantId: string,
    userId: string,
    sessionId: string,
  ): TransformContextFn;
  getModelConfig(): ModelConfig;
}

export interface SubagentWorkerConfig {
  pollIntervalMs: number;
  fakeExecution: "" | "echo";
}

export interface WorkerState {
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionDir: string;
  input: CreateManagedAgentInput;
  history: Message[];
  workerConfig: SubagentWorkerConfig;
}
