/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { defineProfile } from "@agentrail/app";
import { Type, defineAgent, defineTool, isRuntimeError, type Message } from "@agentrail/core";

const MODEL_PROVIDER = (process.env.MODEL_PROVIDER ?? "anthropic") as "anthropic" | "openai";
const MODEL_ID = process.env.MODEL_ID ?? "claude-3-5-sonnet-20241022";

/**
 * A tool with an object-typed parameter so that plugin `onBeforeToolCall` hooks fire.
 * The app layer only dispatches onBeforeToolCall when the tool input is a plain object.
 */
export const echoTool = defineTool({
  name: "echo",
  description: "Returns the provided message back to the caller.",
  parameters: Type.Object({
    message: Type.String({ description: "The message to echo back." }),
  }),
  execute: async ({ message }) => {
    return { content: [{ type: "text" as const, text: `Echo: ${message}` }], details: undefined };
  },
});

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

export const defaultProfile = defineProfile({
  id: "plugins-agent",
  name: "Custom Plugin Agent",
  agent: {
    model: `${MODEL_PROVIDER}:${MODEL_ID}`,
    prompt:
      "You are a helpful assistant. You have access to an echo tool. " +
      "Use it when the user asks you to echo something.",
    tools: [echoTool],
  },
});
