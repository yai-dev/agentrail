/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { ContextProvider, Message, TransformContextFn } from "@agentrail/core";
import { describe, expect, it } from "vitest";
import { createTransformContext } from "../src/context-pipeline.js";

function userMessage(text: string): Message {
  return {
    role: "user",
    content: text,
    timestamp: Date.now(),
  } as Message;
}

describe("createTransformContext", () => {
  it("runs rewrite transforms before providers and prepends injected messages", async () => {
    const baseTransform: TransformContextFn = async (messages) => [
      userMessage("rewritten history"),
      ...messages.slice(1),
    ];
    const provider: ContextProvider = async (_context, messages) => [
      userMessage(
        `provider saw: ${messages[0]?.role === "user" ? messages[0].content : "unknown"}`,
      ),
    ];
    const transform = createTransformContext(
      [provider],
      { tenantId: "t1", userId: "u1", sessionId: "s1" },
      baseTransform,
    );

    const result = await transform([userMessage("original history")]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ role: "user", content: "provider saw: rewritten history" });
    expect(result[1]).toMatchObject({ role: "user", content: "rewritten history" });
  });
});
