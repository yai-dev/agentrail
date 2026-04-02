/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Message } from "@agentrail/runtime-core";
import { describe, expect, it } from "vitest";
import { createTransformContext } from "../src/context-pipeline.js";

describe("createTransformContext", () => {
  it("prepends provider output in registration order", async () => {
    const transform = createTransformContext(
      [
        async () => [
          {
            role: "user",
            content: "provider-a",
            timestamp: 1,
          },
        ],
        async () => [
          {
            role: "user",
            content: "provider-b",
            timestamp: 2,
          },
        ],
      ],
      {
        tenantId: "tenant-1",
        userId: "user-1",
        sessionId: "session-1",
      },
    );

    const messages: Message[] = [
      {
        role: "user",
        content: "original",
        timestamp: 3,
      },
    ];

    await expect(transform(messages)).resolves.toEqual([
      { role: "user", content: "provider-a", timestamp: 1 },
      { role: "user", content: "provider-b", timestamp: 2 },
      { role: "user", content: "original", timestamp: 3 },
    ]);
  });
});
