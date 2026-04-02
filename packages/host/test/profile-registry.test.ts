/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createSessionRef } from "@agentrail/memo";
import { describe, expect, it } from "vitest";
import { createProfileResolver } from "../src/profile-registry.js";

describe("createProfileResolver", () => {
  it("resolves a registered profile by id", async () => {
    const profile = {
      id: "agent-1",
      name: "Agent 1",
      createAgent: async () => {
        throw new Error("not used");
      },
    };

    const resolveProfile = createProfileResolver([profile]);

    await expect(
      resolveProfile("agent-1", {
        tenantId: "tenant-1",
        userId: "user-1",
        sessionId: "session-1",
        sessionRef: createSessionRef("tenant-1", "session-1"),
        sessionStore: {} as never,
      }),
    ).resolves.toBe(profile);
  });

  it("returns null for unknown profile ids", async () => {
    const resolveProfile = createProfileResolver([]);

    await expect(
      resolveProfile("missing", {
        tenantId: "tenant-1",
        userId: "user-1",
        sessionId: "session-1",
        sessionRef: createSessionRef("tenant-1", "session-1"),
        sessionStore: {} as never,
      }),
    ).resolves.toBeNull();
  });
});
