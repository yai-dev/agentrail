import { defineAgent, isRuntimeError, type Message } from "@agentrail/runtime-core";
import { createHostedProfileResolver, defineHostedProfile } from "@agentrail/host/defaults";

const MODEL_PROVIDER = (process.env.MODEL_PROVIDER ?? "anthropic") as "anthropic" | "openai";
const MODEL_ID = process.env.MODEL_ID ?? "claude-3-5-sonnet-20241022";

export const AGENT_ID = "{{PROJECT_NAME}}-agent";

// ---------------------------------------------------------------------------
// Summarizer — used by the host for Layer 3 context compaction
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
      if (event.type === "agent_end") break;
    }

    return summary.trim() || "(summarization produced no output)";
  };
}

// ---------------------------------------------------------------------------
// Profile — the agent definition wired into the stream route
// ---------------------------------------------------------------------------

export const defaultProfile = defineHostedProfile({
  id: AGENT_ID,
  name: "{{PROJECT_NAME}} Agent",
  promptBuilder: async () => "You are a helpful assistant.",
  createAgent: async () =>
    defineAgent({
      id: AGENT_ID,
      name: "{{PROJECT_NAME}} Agent",
      model: { provider: MODEL_PROVIDER, modelId: MODEL_ID },
      system: "You are a helpful assistant.",
      maxTokens: 8192,
      maxTurns: 20,
    }),
});

export const resolveProfile = createHostedProfileResolver([defaultProfile]);
