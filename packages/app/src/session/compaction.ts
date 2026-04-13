/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { estimateMessageTokens } from "@/session/token-estimator.js";
import type { ImageContent, Message, TextContent, ToolResultMessage } from "@agentrail/core";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Thresholds that control view-only compaction of large tool results. */
export interface ToolResultCompactionOptions {
  /** Tool results larger than this (in tokens) are replaced with a placeholder. Default: 1500 */
  maxTokensPerToolResult?: number;
  /**
   * Number of the most-recent tool result messages to always keep intact.
   * These are the results the LLM is currently acting on. Default: 2
   */
  keepRecentToolResults?: number;
  /**
   * Safety ceiling for recent tool results. Recent results are normally preserved,
   * but once a single result grows past this limit it is compacted immediately to
   * avoid blowing up the next model request. Default: max(maxTokensPerToolResult * 4, 6000)
   */
  maxTokensPerRecentToolResult?: number;
  /**
   * Callback to persist a compacted tool-result artifact by tool call ID.
   * Preferred over `sessionDir` — works with any storage backend.
   *
   * When provided, the full tool-result text is passed to this function;
   * the agent receives a placeholder that references the canonical path
   * `/workspace/memo/session/tool-results/{toolCallId}.txt`.
   */
  writeToolResultArtifact?: (toolCallId: string, content: string) => Promise<void>;
  /**
   * @deprecated Use `writeToolResultArtifact` instead.
   * Session directory used to persist compacted tool results for later retrieval.
   * When `writeToolResultArtifact` is also provided, it takes precedence.
   */
  sessionDir?: string;
}

/**
 * Layer 1 compaction: view-only transformation (does NOT modify messages.jsonl).
 *
 * Replaces large ToolResultMessage bodies with a short placeholder that
 * tells the LLM the result was truncated and, when available, where the full
 * text was persisted. The N most-recent tool results are always kept intact so
 * the LLM's current reasoning is not degraded.
 */
export async function compactToolResults(
  messages: Message[],
  options: ToolResultCompactionOptions = {},
): Promise<Message[]> {
  const {
    maxTokensPerToolResult = 1500,
    keepRecentToolResults = 2,
    maxTokensPerRecentToolResult = Math.max(maxTokensPerToolResult * 4, 6000),
    writeToolResultArtifact,
    sessionDir,
  } = options;

  // Collect indices of the most recent tool-result messages so we can preserve them.
  const recentToolResultIndices = new Set<number>();
  let found = 0;
  for (let i = messages.length - 1; i >= 0 && found < keepRecentToolResults; i--) {
    if (messages[i]!.role === "toolResult") {
      recentToolResultIndices.add(i);
      found++;
    }
  }

  return Promise.all(
    messages.map(async (m, i): Promise<Message> => {
      if (m.role !== "toolResult") return m;

      const estimate = estimateMessageTokens([m]);
      const isRecentToolResult = recentToolResultIndices.has(i);
      const shouldCompactRecent = isRecentToolResult && estimate > maxTokensPerRecentToolResult;
      const exceedsGeneralLimit = estimate > maxTokensPerToolResult;

      if (isRecentToolResult && !shouldCompactRecent) return m;
      if (!shouldCompactRecent && !exceedsGeneralLimit) return m;

      const trm = m as ToolResultMessage;

      // Separate text and image blocks
      const textBlocks = trm.content.filter((b): b is TextContent => "text" in b);
      const imageBlocks = trm.content.filter((b): b is ImageContent => b.type === "image");

      const fullText = textBlocks.map((b) => b.text).join("");
      const preview = fullText.slice(0, 200).replace(/\n+/g, " ").trim();
      const canPersist = Boolean(writeToolResultArtifact ?? sessionDir);
      const persistedPath = canPersist
        ? `/workspace/memo/session/tool-results/${trm.toolCallId}.txt`
        : null;

      if (fullText.length > 0) {
        if (writeToolResultArtifact) {
          await writeToolResultArtifact(trm.toolCallId, fullText);
        } else if (sessionDir) {
          const toolResultsDir = path.join(sessionDir, "tool-results");
          await mkdir(toolResultsDir, { recursive: true });
          await writeFile(path.join(toolResultsDir, `${trm.toolCallId}.txt`), fullText, "utf8");
        }
      }

      const compactedText =
        persistedPath && fullText.length > 0
          ? `[Tool result compacted — text saved to session storage (~${estimate} tok).\nPreview: ${preview}…\nTo access: Read ${persistedPath}\nNote: For single-line outputs (e.g. minified JSON), Read may truncate; if available, use Grep or another file-search tool to locate relevant content.]`
          : `[tool result truncated: ~${estimate} tok — re-call the tool to get full content]\n${preview}…`;

      const compactedContent: ToolResultMessage["content"] = [
        { type: "text", text: compactedText },
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
    }),
  );
}
