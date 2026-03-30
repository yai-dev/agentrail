/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it } from "vitest";
import { createSlashCommandRegistry } from "../src/registry.js";

describe("createSlashCommandRegistry", () => {
  const registry = createSlashCommandRegistry([
    {
      name: "memory consolidate",
      description: "Queue memory consolidation.",
      scope: "user",
      requiresSession: false,
      runsInBackground: true,
      writesConversationHistory: false,
      handler: async (parsed, context) => ({
        command: parsed.raw,
        status: "queued",
        message: `queued for ${context.userId}`,
      }),
    },
    {
      name: "compact",
      description: "Compact current session.",
      scope: "session",
      requiresSession: true,
      runsInBackground: false,
      writesConversationHistory: false,
      handler: async (parsed, context) => ({
        command: parsed.raw,
        status: "completed",
        message: `compacted ${context.sessionId}`,
      }),
    },
  ]);

  it("recognizes registered commands", () => {
    expect(registry.parseRegistered("/memory consolidate")).toEqual({
      raw: "/memory consolidate",
      tokens: ["memory", "consolidate"],
    });
    expect(registry.parseRegistered("/unknown")).toBeNull();
  });

  it("returns an error for invalid slash commands", async () => {
    await expect(
      registry.execute("hello", {
        tenantId: "tenant-1",
        userId: "user-1",
      }),
    ).resolves.toMatchObject({
      status: "error",
    });
  });

  it("enforces session requirements", async () => {
    await expect(
      registry.execute("/compact", {
        tenantId: "tenant-1",
        userId: "user-1",
      }),
    ).resolves.toMatchObject({
      status: "error",
      sessionId: null,
    });
  });

  it("dispatches registered handlers", async () => {
    await expect(
      registry.execute("/compact", {
        tenantId: "tenant-1",
        userId: "user-1",
        sessionId: "session-1",
      }),
    ).resolves.toMatchObject({
      status: "completed",
      message: "compacted session-1",
    });
  });
});
