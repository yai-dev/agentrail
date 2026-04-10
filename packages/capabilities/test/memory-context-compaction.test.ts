/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { MemoryIndex, Message } from "@agentrail/core";
import { describe, expect, it, vi } from "vitest";
import { createDefaultCapabilityTransformContext } from "../src/memory/context.js";

function userMsg(text: string): Message {
  return { role: "user", content: text, timestamp: Date.now() } as Message;
}

describe("createDefaultCapabilityTransformContext", () => {
  it("passes sessionDir to compactMessages and awaits async results", async () => {
    const sessionDir = "/tmp/agentrail-session";
    const input = [userMsg("hello")];
    const memoryIndex: MemoryIndex = {
      sessionDir,
      userDir: "/tmp/agentrail-user",
      entries: [],
    };
    const compacted = [userMsg("compacted")];
    const compactMessages = vi.fn(async (messages: Message[], ctx?: { sessionDir?: string }) => {
      await Promise.resolve();
      expect(messages).toEqual(input);
      expect(ctx).toEqual({ sessionDir });
      return compacted;
    });

    const transform = createDefaultCapabilityTransformContext({
      tenantId: "tenant-1",
      userId: "user-1",
      sessionId: "session-1",
      delegateSkillsToSubAgent: false,
      buildMemoryIndex: async () => memoryIndex,
      listKnowledgeMetadatas: async () => [],
      listSkills: async () => [],
      compactMessages,
    });

    const result = await transform(input);

    expect(compactMessages).toHaveBeenCalledTimes(1);
    expect(compactMessages).toHaveBeenCalledWith(input, { sessionDir });
    expect(result.at(-1)).toEqual(compacted[0]);
  });
});
