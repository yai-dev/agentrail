import { defineAgent, isRuntimeError, type Message } from "@agentrail/core";
import { defineProfile } from "@agentrail/app";
// To add filesystem, browser, knowledge, or orchestration capabilities install
// @agentrail/capabilities and import the relevant factory functions:
//   import { filesystem, knowledge, browser } from "@agentrail/capabilities";

const MODEL_PROVIDER = (process.env.MODEL_PROVIDER ?? "anthropic") as "anthropic" | "openai";
const MODEL_ID = process.env.MODEL_ID ?? "claude-3-5-sonnet-20241022";

export const AGENT_ID = "{{PROJECT_NAME}}-agent";

// ---------------------------------------------------------------------------
// Summarizer — used by the app for Layer 3 context compaction
// ---------------------------------------------------------------------------

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
      if (event.type === "message_update" && event.event.type === "text_delta") {
        summary += event.event.delta;
      }
      if (event.type === "session.end") break;
    }

    return summary.trim() || "(summarization produced no output)";
  };
}

// ---------------------------------------------------------------------------
// Profile — the agent definition wired into the app
// ---------------------------------------------------------------------------

export const defaultProfile = defineProfile({
  id: AGENT_ID,
  name: "{{PROJECT_NAME}} Agent",
  agent: {
    model: `${MODEL_PROVIDER}:${MODEL_ID}`,
    prompt: "You are a helpful assistant.",
  },
});
