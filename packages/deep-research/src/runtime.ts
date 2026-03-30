/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

export interface DeepResearchModelConfig {
  provider: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface DeepResearchRuntimeConfig {
  dataDir: string;
  model: DeepResearchModelConfig;
  searchProvider?: string;
  tavilyApiKey?: string;
  sandbox?: {
    image?: string;
    idleTimeoutMs?: number;
  };
  orchestration?: {
    subagent?: {
      pollIntervalMs?: number;
      fakeExecution?: "" | "echo";
    };
  };
}
