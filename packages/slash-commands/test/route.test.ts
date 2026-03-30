/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it } from "vitest";
import { createCommandsRoute } from "../src/route.js";
import { createSlashCommandRegistry } from "../src/registry.js";

describe("createCommandsRoute", () => {
  const route = createCommandsRoute(
    createSlashCommandRegistry([
      {
        name: "compact",
        description: "Compact current session.",
        scope: "session",
        requiresSession: true,
        runsInBackground: false,
        writesConversationHistory: false,
        handler: async (parsed) => ({
          command: parsed.raw,
          status: "completed",
          message: "ok",
        }),
      },
    ]),
  );

  it("lists availability metadata", async () => {
    const response = await route.request("http://localhost/");
    const payload = await response.json();

    expect(payload).toEqual({
      commands: [
        {
          name: "/compact",
          description: "Compact current session.",
          scope: "session",
          requiresSession: true,
          runsInBackground: false,
          writesConversationHistory: false,
          available: false,
          unavailableReason: "需要先进入一个已有会话",
        },
      ],
    });
  });

  it("executes commands from POST bodies", async () => {
    const response = await route.request("http://localhost/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        command: "/compact",
        tenantId: "tenant-1",
        userId: "user-1",
        sessionId: "session-1",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "completed",
      message: "ok",
    });
  });
});
