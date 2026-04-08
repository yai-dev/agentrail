/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Message } from "@agentrail/core";
import { defineAgent, isRuntimeError } from "@agentrail/core";
import "@agentrail/core/providers";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { config } from "@/config.js";
import { sessionManager } from "@/context/index.js";

const LAST_SUMMARY_AT_FILE = ".last_preference_summary_at";
const COOLDOWN_MS = (config.userPreferenceSummary.cooldownHours || 24) * 60 * 60 * 1000;

/** In-flight summarization per user to avoid concurrent runs. */
const inFlight = new Set<string>();

function userKey(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function renderMessage(m: Message): string | null {
  if (m.role === "user") {
    const text =
      typeof m.content === "string"
        ? m.content
        : (m.content as { type: string; text?: string }[])
            .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
            .join("");
    const clean = text.trim();
    return clean ? `**User:** ${trunc(clean, 800)}` : null;
  }
  if (m.role === "assistant") {
    const parts: string[] = [];
    for (const block of m.content as { type: string; text?: string; arguments?: unknown }[]) {
      if (block.type === "text" && block.text?.trim()) {
        parts.push(trunc(block.text.trim(), 400));
      } else if (block.type === "toolCall") {
        const paramStr = JSON.stringify(block.arguments ?? {});
        parts.push(`→ Tool: ${trunc(paramStr, 150)}`);
      }
    }
    return parts.length ? `**Assistant:** ${parts.join("\n")}` : null;
  }
  if (m.role === "toolResult") {
    const resultText = (m.content as { type: string; text?: string }[])
      .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
      .join("");
    const clean = resultText.trim();
    return clean ? `  ↳ result: ${trunc(clean, 300)}` : null;
  }
  return null;
}

function formatForPreferenceSummarization(messages: Message[]): string {
  return messages
    .map(renderMessage)
    .filter((s): s is string => s !== null)
    .join("\n\n");
}

const SYSTEM_PROMPT = `You are a user preference extractor. Your task is to read conversation history (possibly from multiple sessions) and produce a short, structured summary to append to the user's profile (USER.md) so the assistant can serve them better in future conversations.

Extract and write ONLY the following sections that have evidence in the conversations (omit any section with nothing to report):

**Preferences**
Language, level of detail preferred, common domains or use cases, communication style.

**Focus areas**
Recurring topics, entity types they often query (e.g. leads, opportunities, customers), repeated questions or goals.

**Role / context**
Job role or identity if mentioned (e.g. sales, support, manager).

**Avoid**
Things the user asked not to do, or clear dislikes.

Rules:
- Write in the same language as the conversations.
- Be concise and factual; no filler or meta-commentary.
- Maximum 350 words total.
- Output valid Markdown (headers, lists). No preamble.`;

/**
 * Runs user preference summarization for the given user if enabled and not throttled.
 * Loads recent sessions, merges messages, calls LLM, and appends to USER.md.
 * Fire-and-forget from the stream route; does not throw to the caller.
 */
export async function maybeSummarizeUserPreferences(
  tenantId: string,
  userId: string,
): Promise<void> {
  const cfg = config.userPreferenceSummary;
  if (!cfg.enabled) return;

  const key = userKey(tenantId, userId);
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    await runSummarizeUserPreferences(tenantId, userId);
  } catch {
    // Non-critical: log in dev if needed; do not surface to client
  } finally {
    inFlight.delete(key);
  }
}

async function runSummarizeUserPreferences(tenantId: string, userId: string): Promise<void> {
  const cfg = config.userPreferenceSummary;
  const userDir = sessionManager.getUserDir(tenantId, userId);
  const lastAtPath = `${userDir}/${LAST_SUMMARY_AT_FILE}`;
  const userMdPath = `${userDir}/USER.md`;

  // Cooldown
  try {
    const raw = await readFile(lastAtPath, "utf8");
    const lastAt = parseInt(raw.trim(), 10);
    if (!Number.isNaN(lastAt) && Date.now() - lastAt < COOLDOWN_MS) return;
  } catch {
    // No file or unreadable — proceed
  }

  const sessions = await sessionManager.listSessionIdsByUser(
    tenantId,
    userId,
    cfg.maxSessionsToRead,
  );
  if (sessions.length < cfg.minSessions) return;

  const allMessages: Message[] = [];
  for (const { sessionId } of sessions) {
    const msgs = await sessionManager.loadAllMessages(tenantId, sessionId);
    allMessages.push(...msgs);
  }
  if (allMessages.length < 4) return;

  // Keep most recent messages up to cap
  const capped = allMessages.slice(-cfg.maxMessagesPerRun);
  const formatted = formatForPreferenceSummarization(capped);
  if (!formatted.trim()) return;

  const summarizer = defineAgent({
    id: "user-preference-summarizer",
    model: {
      provider: config.provider,
      modelId: config.modelId,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    },
    system: SYSTEM_PROMPT,
    maxTokens: 800,
    temperature: 0,
  });

  let summary = "";
  for await (const event of summarizer.stream(
    `From the following conversation excerpt(s), extract user preferences and focus areas for USER.md:\n\n${formatted}`,
  )) {
    if (isRuntimeError(event)) return;
    if (event.type === "message.update" && event.event.type === "text_delta") {
      summary += event.event.delta;
    }
    if (event.type === "session.end") break;
  }
  summary = summary.trim();
  if (!summary) return;

  const dateLabel = new Date().toISOString().slice(0, 10);
  const section = ["", `## 近期偏好与重点 (${dateLabel})`, "", summary, ""].join("\n");

  const { mkdir } = await import("node:fs/promises");
  try {
    await appendFile(userMdPath, section, "utf8");
  } catch {
    await mkdir(userDir, { recursive: true });
    try {
      const initial = `<!-- summary: 用户画像与偏好 -->\n\n${section.trim()}\n`;
      await writeFile(userMdPath, initial, "utf8");
    } catch {
      return;
    }
  }

  await writeFile(lastAtPath, String(Date.now()), "utf8");
}
