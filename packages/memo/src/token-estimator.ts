/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Message } from "@agentrail/runtime-core";

/**
 * Estimates token count for a string, using character-weight heuristics:
 * - CJK and other non-ASCII characters: 1 token per character
 * - ASCII characters: 0.25 tokens per character (≈ 4 chars per token)
 *
 * More accurate than a flat bytes/4 ratio for mixed Chinese/English text.
 */
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const ch of text) {
    tokens += ch.codePointAt(0)! > 0x7f ? 1 : 0.25;
  }
  return Math.ceil(tokens);
}

/**
 * Estimates token count from a file size in bytes.
 * Used when only file metadata (stat) is available, not the content.
 * Uses ~3 bytes per token as a conservative estimate for mixed content.
 */
export function estimateFileTokens(sizeBytes: number): number {
  return Math.ceil(sizeBytes / 3);
}

// Approximate token cost per image (Claude charges ~1000-4000 tokens per image
// depending on resolution; 1500 is a conservative estimate for budget calculations).
const IMAGE_TOKEN_ESTIMATE = 1500;

function extractMessageText(message: Message): string {
  if (message.role === "user") {
    if (typeof message.content === "string") return message.content;
    return message.content.map((b) => ("text" in b ? b.text : "")).join("");
  }
  if (message.role === "assistant") {
    return message.content
      .map((b) => {
        if (b.type === "text") return b.text;
        if (b.type === "thinking") return b.thinking;
        return "";
      })
      .join("");
  }
  // toolResult: extract text blocks only (image blocks counted separately below)
  return message.content.map((b) => ("text" in b ? b.text : "")).join("");
}

function countImageBlocks(message: Message): number {
  if (message.role === "user") {
    if (typeof message.content === "string") return 0;
    return message.content.filter((b) => (b as { type: string }).type === "image").length;
  }
  if (message.role === "toolResult") {
    return message.content.filter((b) => (b as { type: string }).type === "image").length;
  }
  return 0;
}

/**
 * Estimates total token count for an array of messages, including a small
 * per-message overhead (4 tokens) for role/metadata framing.
 */
export function estimateMessageTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => {
    const textTokens = estimateTokens(extractMessageText(m));
    const imageTokens = countImageBlocks(m) * IMAGE_TOKEN_ESTIMATE;
    return sum + textTokens + imageTokens + 4;
  }, 0);
}
