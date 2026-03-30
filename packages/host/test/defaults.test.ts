/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it } from "vitest";
import type { Message, RuntimeTool } from "@agentrail/runtime-core";
import {
  buildDefaultCapabilityTools,
  createDefaultCapabilityContextProviders,
  createDefaultContextProviders,
  createDefaultOrchestrationBinding,
  createDefaultToolset,
  createHostedProfileResolver,
  defineHostedProfile,
} from "../src/defaults.js";

describe("@agentrail/host/defaults", () => {
  it("defines hosted profiles and resolves them by id", async () => {
    const profile = defineHostedProfile({
      id: "agent-1",
      name: "Agent 1",
      prompt: "You are Agent 1",
      createAgent: async () => {
        throw new Error("not used");
      },
    });

    const resolveProfile = createHostedProfileResolver([profile]);
    await expect(
      resolveProfile("agent-1", {
        tenantId: "tenant-1",
        userId: "user-1",
        sessionId: "session-1",
        sessionDir: "/tmp/session-1",
      }),
    ).resolves.toBe(profile);
  });

  it("creates default context providers and toolsets without extra glue", async () => {
    const provider = async () => [];
    const tool = { id: "tool-a", description: "A", inputSchema: {}, execute: async () => ({ ok: true }) } as unknown as RuntimeTool;

    expect(
      createDefaultContextProviders({
        baseProviders: [provider],
        optionalProviders: [null, provider],
      }),
    ).toEqual([provider, provider]);

    expect(
      createDefaultToolset({
        executionTools: [tool],
        optionalTools: [null, tool],
      }),
    ).toEqual([tool, tool]);
  });

  it("builds default capability context providers from capability loaders", async () => {
    const providers = createDefaultCapabilityContextProviders({
      tenantId: "tenant-1",
      userId: "user-1",
      sessionId: "session-1",
      delegateSkillsToSubAgent: true,
      buildMemoryIndex: async () => ({
        sessionDir: "/tmp/sessions/session-1",
        userDir: "/tmp/users/user-1",
        entries: [],
      }),
      listKnowledgeMetadatas: async () => [],
      listSkills: async () => [],
      listWorkspaceSnapshot: async () => "TODO.md",
      compactMessages: (messages) =>
        messages.map((message) =>
          message.role === "toolResult"
            ? { role: "user", content: "[tool result compacted]", timestamp: 3 }
            : message,
        ) as Message[],
    });

    expect(providers).toHaveLength(1);
    await expect(
      providers[0]!({ tenantId: "tenant-1", userId: "user-1", sessionId: "session-1" }, [
        { role: "user", content: "hello", timestamp: 1 },
        { role: "toolResult", content: [], toolCallId: "tool-1", timestamp: 2 },
      ] as Message[]),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("[Memory Index]"),
        }),
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("[Sandbox Workspace]"),
        }),
      ]),
    );
  });

  it("builds default capability tools with skills disabled", async () => {
    const { executionTools, browserTools, skillTool } =
      await buildDefaultCapabilityTools({
        tenantId: "tenant-1",
        userId: "user-1",
        sessionId: "session-1",
        sessionDir: "/tmp/session-1",
        knowledgeManager: {} as never,
        sandboxManager: {} as never,
        waitHandleRegistry: {} as never,
        modelConfig: {
          provider: "mock",
          modelId: "mock-model",
        },
        includeSkillTool: false,
      });

    expect(executionTools).toHaveLength(10);
    expect(browserTools).toHaveLength(4);
    expect(skillTool).toBeNull();
  });

  it("returns orchestration bindings unchanged", () => {
    const binding = { createManagedAgent: async () => "ok" };
    expect(createDefaultOrchestrationBinding(binding)).toBe(binding);
  });
});
