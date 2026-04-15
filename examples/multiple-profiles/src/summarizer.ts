/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { defineAgent, isRuntimeError, type Message } from "@agentrail/core";

const MODEL_PROVIDER = (process.env.MODEL_PROVIDER ?? "anthropic") as "anthropic" | "openai";
const MODEL_ID = process.env.MODEL_ID ?? "claude-3-5-sonnet-20241022";

export function buildSummarizeFn(): (messages: Message[]) => Promise<string> {
  const summarizer = defineAgent({
    id: "summarizer",
    model: { provider: MODEL_PROVIDER, modelId: MODEL_ID },
    system:
      "Produce a concise summary of the provided conversation. " +
      "Be specific and factual. Maximum 400 words.",
    maxTokens: 800,
    temperature: 0,
  });

  return async (messages: Message[]): Promise<string> => {
    const transcript = messages
      .map((m) => {
        if (m.role === "user") {
          const content =
            typeof m.content === "string"
              ? m.content
              : m.content.map((b) => (b.type === "text" ? b.text : "")).join("");
          return `User: ${content}`;
        }
        if (m.role === "assistant") {
          return `Assistant: ${m.content.map((b) => (b.type === "text" ? b.text : "")).join("")}`;
        }
        return null;
      })
      .filter((s): s is string => s !== null)
      .join("\n\n");

    if (!transcript.trim()) return "(nothing to summarize)";

    let summary = "";
    for await (const event of summarizer.stream(`Summarize this conversation:\n\n${transcript}`)) {
      if (isRuntimeError(event)) return "(summarization failed)";
      if (event.type === "message.update" && event.event.type === "text_delta") {
        summary += event.event.delta;
      }
      if (event.type === "session.end") break;
    }

    return summary.trim() || "(summarization produced no output)";
  };
}
