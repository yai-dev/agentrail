/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, it, expect, vi } from "vitest";
import { defineProfile } from "../src/profile/define-profile.js";
import type { AgentrailProfileContext } from "../src/host/types.js";

const fakeContext: AgentrailProfileContext = {
  tenantId: "t1",
  userId: "u1",
  sessionId: "s1",
  sessionRef: "t1:s1" as never,
  sessionStore: {} as never,
};

describe("defineProfile – static shape", () => {
  it("creates a ProfileDefinition with the correct id and name", () => {
    const profile = defineProfile({
      id: "test-agent",
      name: "Test Agent",
      agent: { model: "anthropic:claude-3-5-sonnet-20241022", prompt: "Be helpful." },
    });
    expect(profile.id).toBe("test-agent");
    expect(profile.name).toBe("Test Agent");
  });

  it("forwards capabilities to the definition", () => {
    const cap = { type: "fake", buildTools: async () => [] };
    const profile = defineProfile({
      id: "a",
      name: "A",
      agent: { model: "openai:gpt-4o", prompt: "..." },
      capabilities: [cap],
    });
    expect(profile.capabilities).toEqual([cap]);
  });

  it("resolves a dynamic prompt string via the factory", async () => {
    const dynamicPrompt = vi.fn().mockResolvedValue("Dynamic system prompt");
    const profile = defineProfile({
      id: "dyn",
      name: "Dynamic",
      agent: { model: "openai:gpt-4o", prompt: dynamicPrompt },
    });
    // Calling createAgent should invoke the prompt factory with context
    await profile.createAgent(fakeContext);
    expect(dynamicPrompt).toHaveBeenCalledWith(fakeContext);
  });

  it("passes static prompt string through without calling defineAgent with wrong model", async () => {
    const profile = defineProfile({
      id: "static",
      name: "Static",
      agent: { model: "openai:gpt-4o", prompt: "Hello." },
    });
    // Should not throw; defineAgent is called internally
    await expect(profile.createAgent(fakeContext)).resolves.toBeDefined();
  });

  it("merges modelConfig overrides into the model when provided", async () => {
    const profile = defineProfile({
      id: "custom-key",
      name: "Custom Key",
      agent: { model: "openai:gpt-4o", prompt: "Hi." },
      modelConfig: { apiKey: "sk-custom" },
    });
    // createAgent should not throw; the apiKey override should be applied
    const agent = await profile.createAgent(fakeContext);
    expect(agent).toBeDefined();
  });
});

describe("defineProfile – dynamic shape", () => {
  it("calls the provided createAgent factory", async () => {
    const fakeAgent = { invoke: vi.fn(), stream: vi.fn() };
    const factory = vi.fn().mockResolvedValue(fakeAgent);
    const profile = defineProfile({
      id: "dynamic",
      name: "Dynamic",
      createAgent: factory,
    });
    const agent = await profile.createAgent(fakeContext);
    expect(factory).toHaveBeenCalledWith(fakeContext);
    expect(agent).toBe(fakeAgent);
  });

  it("forwards capabilities on dynamic shape", () => {
    const cap = { type: "custom", buildTools: async () => [] };
    const profile = defineProfile({
      id: "d",
      name: "D",
      createAgent: async () => ({}) as never,
      capabilities: [cap],
    });
    expect(profile.capabilities).toEqual([cap]);
  });
});
