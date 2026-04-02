/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  ImageContent,
  Message,
  TextContent,
  ToolResultMessage,
} from "@agentrail/runtime-core";
import { estimateMessageTokens } from "./token-estimator.js";

/** Thresholds that control view-only compaction of large tool results. */
export interface ToolResultCompactionOptions {
  /** Tool results larger than this (in tokens) are replaced with a placeholder. Default: 1500 */
  maxTokensPerToolResult?: number;
  /**
   * Number of the most-recent tool result messages to always keep intact.
   * These are the results the LLM is currently acting on. Default: 2
   */
  keepRecentToolResults?: number;
}

/**
 * Layer 1 compaction: view-only transformation (does NOT modify messages.jsonl).
 *
 * Replaces large ToolResultMessage bodies with a short placeholder that
 * tells the LLM the result was truncated and it can re-call the tool to
 * retrieve the full content.  The N most-recent tool results are always kept
 * intact so the LLM's current reasoning is not degraded.
 */
export function compactToolResults(
  messages: Message[],
  options: ToolResultCompactionOptions = {},
): Message[] {
  const { maxTokensPerToolResult = 1500, keepRecentToolResults = 2 } = options;

  // Collect indices of the most recent tool-result messages so we can preserve them.
  const recentToolResultIndices = new Set<number>();
  let found = 0;
  for (let i = messages.length - 1; i >= 0 && found < keepRecentToolResults; i--) {
    if (messages[i]!.role === "toolResult") {
      recentToolResultIndices.add(i);
      found++;
    }
  }

  return messages.map((m, i): Message => {
    if (m.role !== "toolResult") return m;
    if (recentToolResultIndices.has(i)) return m;

    const estimate = estimateMessageTokens([m]);
    if (estimate <= maxTokensPerToolResult) return m;

    const trm = m as ToolResultMessage;

    // Separate text and image blocks
    const textBlocks = trm.content.filter((b): b is TextContent => "text" in b);
    const imageBlocks = trm.content.filter((b): b is ImageContent => b.type === "image");

    const fullText = textBlocks.map((b) => b.text).join("");
    const preview = fullText.slice(0, 200).replace(/\n+/g, " ").trim();

    const compactedContent: ToolResultMessage["content"] = [
      {
        type: "text",
        text: `[tool result truncated: ~${estimate} tok — re-call the tool to get full content]\n${preview}…`,
      },
    ];

    // Replace image blocks with path-reference placeholders so the LLM knows
    // they exist and can request them again, without storing base64 in context.
    if (imageBlocks.length > 0) {
      compactedContent.push({
        type: "text",
        text: `[${imageBlocks.length} image(s) removed from context]`,
      });
    }

    const compactedResult: ToolResultMessage = {
      ...trm,
      content: compactedContent,
    };
    return compactedResult;
  });
}
