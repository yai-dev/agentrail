/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import {
  createDefaultCapabilityContextProviders,
  createDefaultCapabilityTransformContext,
} from "@agentrail/capabilities";
import type { AssistantMessage, MemoryIndex, Message, ToolResultMessage } from "@agentrail/core";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createTransformContext } from "../src/host/context-pipeline.js";
import {
  createReactiveCompactionController,
  groupMessagesByApiRound,
} from "../src/host/reactive-compaction.js";
import { compactToolResults } from "../src/session/compaction.js";

function userMessage(text: string): Message {
  return {
    role: "user",
    content: text,
    timestamp: Date.now(),
  } as Message;
}

function assistantMessage(
  text: string,
  overrides: Partial<AssistantMessage> = {},
): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason: "stop",
    provider: "mock",
    modelId: "mock",
    usage: {
      inputTokens: 100,
      outputTokens: 10,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 110,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    timestamp: Date.now(),
    ...overrides,
  } as AssistantMessage;
}

function toolResultMessage(text: string, toolCallId = "tool-1"): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId,
    toolName: "Bash",
    isError: false,
    content: [{ type: "text", text }],
    timestamp: Date.now(),
  };
}

function extractTextContent(message: Message): string {
  if (message.role === "user") {
    return typeof message.content === "string" ? message.content : "";
  }
  if (message.role === "assistant") {
    return message.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  }
  if (message.role === "toolResult") {
    return message.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  }
  return "";
}

describe("reactive compaction helpers", () => {
  it("groups messages by API round boundaries", () => {
    const messages: Message[] = [
      userMessage("prompt"),
      assistantMessage("thinking"),
      toolResultMessage("tool result"),
      assistantMessage("final"),
    ];

    const groups = groupMessagesByApiRound(messages);

    expect(groups).toHaveLength(3);
    expect(groups[0]?.map((message) => message.role)).toEqual(["user"]);
    expect(groups[1]?.map((message) => message.role)).toEqual(["assistant", "toolResult"]);
    expect(groups[2]?.map((message) => message.role)).toEqual(["assistant"]);
  });

  it("applies micro compaction to older API rounds while preserving the current prompt", async () => {
    const summarize = vi.fn(async (messages: Message[]) => `summary(${messages.length})`);
    const controller = createReactiveCompactionController({
      summarize,
      contextWindow: 10_000,
      config: {
        microTriggerPct: 85,
        fullTriggerPct: 95,
        preserveRecentApiRounds: 1,
        microBatchGroups: 1,
      },
    });
    const prompt = userMessage("current prompt");
    const messages: Message[] = [
      userMessage("old request"),
      assistantMessage("old response"),
      toolResultMessage("old tool result"),
      prompt,
      assistantMessage("current response"),
      toolResultMessage("current tool result"),
    ];

    const decision = await controller.maybeCompact({
      messages,
      turnCount: 2,
      usage: {
        inputTokens: 8_600,
        outputTokens: 200,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 8_800,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      latestMessage: assistantMessage("current response"),
      protectedMessages: [prompt],
      records: [],
    });

    expect(decision?.strategy).toBe("micro");
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(
      decision?.messages.some((message) => extractTextContent(message).includes("current prompt")),
    ).toBe(true);
    expect(
      decision?.messages.some((message) =>
        extractTextContent(message).startsWith("[Agentrail reactive micro-compaction summary]"),
      ),
    ).toBe(true);
  });

  it("upgrades to full compaction after prompt-too-long errors", async () => {
    const controller = createReactiveCompactionController({
      summarize: async () => "full summary",
      config: { preserveRecentApiRounds: 1 },
    });
    const prompt = userMessage("protected prompt");
    const errorMessage = assistantMessage("provider error", {
      stopReason: "error",
      errorMessage: "context window exceeds limit",
    });
    const decision = await controller.maybeCompact({
      messages: [
        userMessage("older context"),
        assistantMessage("older reply"),
        prompt,
        toolResultMessage("latest tool output"),
      ],
      turnCount: 3,
      latestMessage: errorMessage,
      protectedMessages: [prompt],
      records: [],
    });

    expect(decision?.strategy).toBe("full");
    expect(decision?.trigger).toBe("prompt_too_long");
    expect(
      decision?.messages.some((message) =>
        extractTextContent(message).startsWith("[Agentrail reactive full-compaction summary]"),
      ),
    ).toBe(true);
    expect(
      decision?.messages.some((message) =>
        extractTextContent(message).includes("protected prompt"),
      ),
    ).toBe(true);
  });
});

describe("memory-context compaction integration", () => {
  it("feeds compacted tool results into the model-facing transform pipeline", async () => {
    const sessionDir = await mkdtemp(path.join(tmpdir(), "agentrail-reactive-"));
    const statefulMemoryIndex: MemoryIndex = {
      sessionDir,
      userDir: path.join(sessionDir, "user"),
      entries: [],
    };

    try {
      const options = {
        tenantId: "tenant-1",
        userId: "user-1",
        sessionId: "session-1",
        delegateSkillsToSubAgent: false,
        buildMemoryIndex: async () => statefulMemoryIndex,
        listKnowledgeMetadatas: async () => [],
        listSkills: async () => [],
        writeToolResultArtifact: async (toolCallId: string, content: string) => {
          const toolResultsDir = path.join(sessionDir, "tool-results");
          await mkdir(toolResultsDir, { recursive: true });
          await writeFile(path.join(toolResultsDir, `${toolCallId}.txt`), content, "utf8");
        },
        compactMessages: (
          messages: Message[],
          ctx?: {
            writeToolResultArtifact?: (toolCallId: string, content: string) => Promise<void>;
            sessionDir?: string;
          },
        ) =>
          compactToolResults(messages, {
            keepRecentToolResults: 0,
            writeToolResultArtifact: ctx?.writeToolResultArtifact,
            sessionDir: ctx?.sessionDir,
          }),
      };

      const sharedState = {
        cachedContextMsgs: null,
        cacheExpiry: 0,
      };
      const transform = createDefaultCapabilityTransformContext(options, sharedState);
      const providers = createDefaultCapabilityContextProviders(options, sharedState);
      const pipeline = createTransformContext(
        providers,
        { tenantId: "tenant-1", userId: "user-1", sessionId: "session-1" },
        transform,
      );
      const hugeText = "x".repeat(12_000);

      const result = await pipeline([toolResultMessage(hugeText, "tool-huge")]);

      expect(result.some((message) => extractTextContent(message).includes(hugeText))).toBe(false);
      expect(
        result.some((message) =>
          extractTextContent(message).includes(
            "/workspace/memo/session/tool-results/tool-huge.txt",
          ),
        ),
      ).toBe(true);
      expect(await readFile(path.join(sessionDir, "tool-results", "tool-huge.txt"), "utf8")).toBe(
        hugeText,
      );
    } finally {
      await rm(sessionDir, { recursive: true, force: true });
    }
  });
});
