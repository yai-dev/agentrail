/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { config } from "@/config.js";
import type { CompactionSummaryContext } from "@agentrail/app";
import type { Message } from "@agentrail/core";
import { defineAgent, isRuntimeError } from "@agentrail/core";
import "@agentrail/core/providers";

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/**
 * Renders a single message as a transcript line, including tool calls and
 * tool results so that "actions taken" context is not silently dropped.
 */
function renderMessage(m: Message): string | null {
  if (m.role === "user") {
    const text =
      typeof m.content === "string"
        ? m.content
        : m.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const clean = text.trim();
    return clean ? `**User:** ${trunc(clean, 1200)}` : null;
  }

  if (m.role === "assistant") {
    const parts: string[] = [];
    for (const block of m.content) {
      if (block.type === "text" && block.text.trim()) {
        parts.push(trunc(block.text.trim(), 600));
      } else if (block.type === "toolCall") {
        // Capture tool name + key params so "actions taken" is preserved
        const paramStr = JSON.stringify(block.arguments ?? {});
        parts.push(`→ Tool: ${block.name}(${trunc(paramStr, 200)})`);
      }
    }
    return parts.length ? `**Assistant:** ${parts.join("\n")}` : null;
  }

  if (m.role === "toolResult") {
    // Include a brief excerpt of tool results; full content is in messages.jsonl.bak
    const resultText = m.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const clean = resultText.trim();
    return clean ? `  ↳ ${m.toolName} result: ${trunc(clean, 400)}` : null;
  }

  return null;
}

/**
 * Formats a Message[] into a human-readable transcript that includes user
 * turns, assistant text AND tool calls, and abbreviated tool results.
 */
function formatForSummarization(messages: Message[]): string {
  return messages
    .map(renderMessage)
    .filter((s): s is string => s !== null)
    .join("\n\n");
}

const SYSTEM_PROMPT = `\
You are an agent conversation compactor. Your task is to produce a concise but \
complete summary of the provided conversation excerpt that will REPLACE those \
messages in the context window. The summary will be stored in session notes \
and referenced by the AI assistant in future turns — it must preserve \
everything needed to continue the conversation without accessing the originals.

Analyse the conversation chronologically, then write your summary with these \
sections (omit any section that has nothing to report):

**User's requests & intent**
What was the user asking for or trying to accomplish in this excerpt?

**Key findings & decisions**
Facts established, conclusions reached, strategy chosen.

**Domain data encountered**
Identifiers, entities, document names, contact details, structured records, \
artifact names, and other domain data mentioned or retrieved.

**Actions taken**
Tools called, files read/written, queries run, documents retrieved. Be \
specific: include tool names and key parameters.

**Pending / unresolved items**
Tasks identified but not yet completed, questions left open, follow-ups needed.

Rules:
- Write in the same language as the conversation.
- Be specific and factual; prefer concrete details over vague descriptions.
- Do NOT include pleasantries, meta-commentary, or filler.
- Maximum 500 words total.`;

/**
 * Builds a one-shot summarization function backed by a minimal defineAgent
 * instance (no tools).  Called lazily only when Layer 3 compaction triggers,
 * so there is no overhead on normal turns.
 */
export function buildSummarizeFn(): (
  messages: Message[],
  ctx?: CompactionSummaryContext,
) => Promise<string> {
  const summarizer = defineAgent({
    id: "conversation-summarizer",
    model: {
      provider: config.provider,
      modelId: config.modelId,
    },
    system: SYSTEM_PROMPT,
    maxTokens: 1000,
    temperature: 0,
  });

  return async (messages: Message[], ctx?: CompactionSummaryContext): Promise<string> => {
    const formatted = formatForSummarization(messages);
    if (!formatted.trim()) return "(no conversation content to summarize)";
    const reasonLine = ctx?.reason ? `Compaction reason: ${ctx.reason}\n\n` : "";

    let summary = "";
    for await (const event of summarizer.stream(
      `${reasonLine}Summarize this conversation excerpt:\n\n${formatted}`,
    )) {
      if (isRuntimeError(event)) {
        const msg = (event.error as Error)?.message ?? "unknown error";
        return `(summarization failed: ${msg})`;
      }
      if (event.type === "message.update" && event.event.type === "text_delta") {
        summary += event.event.delta;
      }
      if (event.type === "session.end") break;
    }
    return summary.trim() || "(summarization produced no output)";
  };
}
