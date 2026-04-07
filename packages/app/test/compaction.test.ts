/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, it, expect } from "vitest";
import { compactToolResults } from "../src/session/compaction.js";
import type { Message, ToolResultMessage } from "@agentrail/core";

function makeToolResult(text: string): ToolResultMessage {
  return {
    role: "toolResult",
    content: [{ type: "text", text }],
    toolUseId: "tool-1",
    timestamp: Date.now(),
  } as ToolResultMessage;
}

function userMsg(text: string): Message {
  return { role: "user", content: text, timestamp: Date.now() } as Message;
}

describe("compactToolResults", () => {
  it("returns non-toolResult messages unchanged", () => {
    const msgs: Message[] = [userMsg("hello")];
    const result = compactToolResults(msgs);
    expect(result).toEqual(msgs);
  });

  it("preserves recent tool results (default 2)", () => {
    const small = makeToolResult("short");
    const msgs: Message[] = [small, small];
    const result = compactToolResults(msgs);
    expect(result).toEqual(msgs);
  });

  it("truncates large tool results that are not in the recency window", () => {
    // Build a large text tool result (> 1500 tokens estimate).
    // ~4 chars per token → 1500 * 4 = 6000 chars.
    const largeText = "x".repeat(8000);
    const largeResult = makeToolResult(largeText);
    const smallRecent = makeToolResult("recent small result");

    // largeResult is at index 0, smallRecent at index 1.
    // keepRecentToolResults=1 → only index 1 is protected.
    const msgs: Message[] = [largeResult, smallRecent];
    const result = compactToolResults(msgs, { keepRecentToolResults: 1 });

    const first = result[0] as ToolResultMessage;
    expect(first.content[0]).toMatchObject({ type: "text" });
    expect((first.content[0] as { text: string }).text).toContain("truncated");

    // The recent one should be unchanged
    expect(result[1]).toEqual(smallRecent);
  });

  it("preserves small tool results even outside the recency window", () => {
    const smallOld = makeToolResult("tiny");
    const smallRecent = makeToolResult("recent");
    const msgs: Message[] = [smallOld, smallRecent];
    const result = compactToolResults(msgs, {
      keepRecentToolResults: 1,
      maxTokensPerToolResult: 2000,
    });
    // Both are small, neither should be compacted
    expect(result[0]).toEqual(smallOld);
    expect(result[1]).toEqual(smallRecent);
  });
});
