/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it } from "vitest";
import { createContextProviderFromTransform } from "../src/context-pipeline.js";
import type { Message } from "@agentrail/runtime-core";

describe("createContextProviderFromTransform", () => {
  it("extracts only injected messages from a transform result", async () => {
    const provider = createContextProviderFromTransform(async (messages) => [
      {
        role: "user",
        content: "injected",
        timestamp: 1,
      },
      ...messages,
    ]);

    const messages: Message[] = [
      {
        role: "user",
        content: "original",
        timestamp: 2,
      },
    ];

    await expect(
      provider(
        {
          tenantId: "tenant-1",
          userId: "user-1",
          sessionId: "session-1",
        },
        messages,
      ),
    ).resolves.toEqual([
      {
        role: "user",
        content: "injected",
        timestamp: 1,
      },
    ]);
  });
});
