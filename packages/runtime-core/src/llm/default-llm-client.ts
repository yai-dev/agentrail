/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { LlmClient, LlmProvider, LlmRequest, LlmStream } from "../interfaces/llm-client.js";
import { LlmProviderRegistry } from "./llm-provider-registry.js";

/** Default `LlmClient` implementation backed by the provider registry singleton. */
export class DefaultLlmClient implements LlmClient {
  private registry: LlmProviderRegistry;

  constructor(registry: LlmProviderRegistry = LlmProviderRegistry.getInstance()) {
    this.registry = registry;
  }

  stream(request: LlmRequest): LlmStream {
    const provider = this.registry.resolve(request.model.provider);
    return provider.stream(request);
  }
}
