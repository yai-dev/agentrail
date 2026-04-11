/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Message, ToolResultMessage } from "@agentrail/core";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compactToolResults } from "../src/session/compaction.js";

function makeToolResult(
  text: string,
  overrides: Partial<ToolResultMessage> = {},
): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: "tool-1",
    toolName: "Read",
    isError: false,
    content: [{ type: "text", text }],
    timestamp: Date.now(),
    ...overrides,
  } as ToolResultMessage;
}

function userMsg(text: string): Message {
  return { role: "user", content: text, timestamp: Date.now() } as Message;
}

describe("compactToolResults", () => {
  it("returns non-toolResult messages unchanged", async () => {
    const msgs: Message[] = [userMsg("hello")];
    const result = await compactToolResults(msgs);
    expect(result).toEqual(msgs);
  });

  it("preserves recent tool results (default 2)", async () => {
    const small = makeToolResult("short");
    const msgs: Message[] = [small, small];
    const result = await compactToolResults(msgs);
    expect(result).toEqual(msgs);
  });

  it("truncates large tool results that are not in the recency window", async () => {
    const largeText = "x".repeat(8000);
    const largeResult = makeToolResult(largeText, { toolCallId: "tool-large" });
    const smallRecent = makeToolResult("recent small result", { toolCallId: "tool-recent" });
    const msgs: Message[] = [largeResult, smallRecent];

    const result = await compactToolResults(msgs, { keepRecentToolResults: 1 });

    const first = result[0] as ToolResultMessage;
    expect(first.content[0]).toMatchObject({ type: "text" });
    expect((first.content[0] as { text: string }).text).toContain("truncated");
    expect(result[1]).toEqual(smallRecent);
  });

  it("persists raw text to disk when sessionDir is provided", async () => {
    const sessionDir = await mkdtemp(path.join(tmpdir(), "agentrail-compaction-"));
    try {
      const largeText = "x".repeat(8000);
      const largeResult = makeToolResult(largeText, { toolCallId: "tool-persisted" });

      const result = await compactToolResults([largeResult], {
        keepRecentToolResults: 0,
        sessionDir,
      });

      const persisted = await readFile(
        path.join(sessionDir, "tool-results", "tool-persisted.txt"),
        "utf8",
      );

      expect(persisted).toBe(largeText);
      expect((result[0] as ToolResultMessage).content[0]).toMatchObject({
        type: "text",
      });
      expect(((result[0] as ToolResultMessage).content[0] as { text: string }).text).toContain(
        "/workspace/memo/session/tool-results/tool-persisted.txt",
      );
    } finally {
      await rm(sessionDir, { recursive: true, force: true });
    }
  });

  it("compacts an oversized recent tool result when it exceeds the emergency recent limit", async () => {
    const sessionDir = await mkdtemp(path.join(tmpdir(), "agentrail-compaction-"));
    try {
      const hugeText = "x".repeat(40000);
      const recentHugeResult = makeToolResult(hugeText, { toolCallId: "tool-recent-huge" });

      const result = await compactToolResults([recentHugeResult], {
        sessionDir,
        maxTokensPerRecentToolResult: 2000,
      });

      const compacted = result[0] as ToolResultMessage;
      expect((compacted.content[0] as { text: string }).text).toContain("Tool result compacted");
      expect((compacted.content[0] as { text: string }).text).toContain(
        "/workspace/memo/session/tool-results/tool-recent-huge.txt",
      );

      const persisted = await readFile(
        path.join(sessionDir, "tool-results", "tool-recent-huge.txt"),
        "utf8",
      );
      expect(persisted).toBe(hugeText);
    } finally {
      await rm(sessionDir, { recursive: true, force: true });
    }
  });

  it("does not create files for small or image-only results", async () => {
    const sessionDir = await mkdtemp(path.join(tmpdir(), "agentrail-compaction-"));
    try {
      const smallResult = makeToolResult("small", { toolCallId: "tool-small" });
      const imageOnlyResult = makeToolResult("", {
        toolCallId: "tool-image",
        content: [{ type: "image", data: "x".repeat(4096), mimeType: "image/png" }],
      });

      await compactToolResults([smallResult], {
        keepRecentToolResults: 0,
        maxTokensPerToolResult: 2000,
        sessionDir,
      });
      await compactToolResults([imageOnlyResult], {
        keepRecentToolResults: 0,
        maxTokensPerToolResult: 1,
        sessionDir,
      });

      await expect(
        readFile(path.join(sessionDir, "tool-results", "tool-small.txt"), "utf8"),
      ).rejects.toThrow();
      await expect(
        readFile(path.join(sessionDir, "tool-results", "tool-image.txt"), "utf8"),
      ).rejects.toThrow();
    } finally {
      await rm(sessionDir, { recursive: true, force: true });
    }
  });
});
