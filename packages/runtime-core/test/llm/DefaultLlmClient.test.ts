/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ProviderNotFoundError } from "../../src/errors.js";
import type { LlmProvider, LlmRequest } from "../../src/interfaces/llm-client.js";
import { DefaultLlmClient } from "../../src/llm/default-llm-client.js";
import { LlmProviderRegistry } from "../../src/llm/llm-provider-registry.js";
import { MockLlmClient } from "../mocks/MockLlmClient.js";

function createMockProvider(
  providerName: string,
  onStream?: (req: LlmRequest) => void,
): LlmProvider {
  const mockClient = new MockLlmClient();
  return {
    provider: providerName,
    stream: (req) => {
      onStream?.(req);
      return mockClient.stream(req);
    },
  };
}

describe("DefaultLlmClient", () => {
  let registry: LlmProviderRegistry;

  beforeEach(() => {
    LlmProviderRegistry.resetInstance();
    registry = LlmProviderRegistry.getInstance();
  });

  it("should route the request to the matching provider", () => {
    let capturedRequest: LlmRequest | null = null;
    const provider = createMockProvider("test-provider", (req) => {
      capturedRequest = req;
    });
    registry.register(provider);

    const client = new DefaultLlmClient(registry);
    const request: LlmRequest = {
      model: { provider: "test-provider", modelId: "test-model" },
      messages: [],
    };

    client.stream(request);

    expect(capturedRequest).toBe(request);
  });

  it("should throw ProviderNotFoundError when the provider is not registered", () => {
    const client = new DefaultLlmClient(registry);
    const request: LlmRequest = {
      model: { provider: "nonexistent", modelId: "test-model" },
      messages: [],
    };

    expect(() => client.stream(request)).toThrow(ProviderNotFoundError);
  });

  it("should use the global registry singleton by default", () => {
    const globalRegistry = LlmProviderRegistry.getInstance();
    globalRegistry.register(createMockProvider("global-provider"));

    const client = new DefaultLlmClient();

    expect(() =>
      client.stream({
        model: { provider: "global-provider", modelId: "m" },
        messages: [],
      }),
    ).not.toThrow();
  });

  it("should return the LLM stream from the provider", () => {
    registry.register(createMockProvider("test-provider"));
    const client = new DefaultLlmClient(registry);

    const stream = client.stream({
      model: { provider: "test-provider", modelId: "m" },
      messages: [],
    });

    expect(stream).toBeDefined();
    expect(typeof stream[Symbol.asyncIterator]).toBe("function");
    expect(typeof stream.result).toBe("function");
  });
});
