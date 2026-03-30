/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import "@agentrail/runtime-core/providers";
import { defineAgent, isRuntimeError } from "@agentrail/runtime-core";
import type { Message } from "@agentrail/runtime-core";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { SessionManager, isCompactionMessage } from "@agentrail/memo";

const STATE_FILE = ".memory-state.json";
const SESSION_SUMMARY_FILE = "user-memory.json";

export interface UserMemoryConfig {
  provider: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  enabled?: boolean;
  idleMinutes?: number;
  scanIntervalMinutes?: number;
  minIntervalHours?: number;
  minChangedSessions?: number;
}

interface UserMemoryState {
  lastActivityAt: number;
  lastCompletedAt: number;
  lastProcessedSessionCount: number;
  lastProcessedSessionUpdatedAt: number;
  pendingReason: string | null;
}

interface SessionMemorySummary {
  sessionId: string;
  sessionUpdatedAt: number;
  generatedAt: number;
  preferences: string[];
  focusAreas: string[];
  roleContext: string[];
  avoid: string[];
  evidence: string[];
}

interface UserProfileSummary {
  summary: string;
  currentProfile: string;
  preferences: string[];
  focusAreas: string[];
  roleContext: string[];
  avoid: string[];
}

function userKey(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 12);
}

function trimLine(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function parseJsonBlock(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]+?)\s*```$/i.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function renderMessages(messages: Message[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      const text = typeof message.content === "string"
        ? message.content
        : message.content.map((block) => ("text" in block ? block.text ?? "" : "")).join("");
      const clean = text.trim();
      if (clean) lines.push(`User: ${clean.slice(0, 1200)}`);
      continue;
    }

    if (message.role === "assistant") {
      const parts: string[] = [];
      for (const block of message.content) {
        if (block.type === "text" && block.text.trim()) {
          parts.push(block.text.trim().slice(0, 800));
        } else if (block.type === "toolCall") {
          parts.push(`Tool ${block.name}(${JSON.stringify(block.arguments ?? {}).slice(0, 240)})`);
        }
      }
      if (parts.length > 0) lines.push(`Assistant: ${parts.join("\n")}`);
      continue;
    }

    if (message.role === "toolResult") {
      const resultText = message.content
        .map((block) => (block.type === "text" ? block.text ?? "" : ""))
        .join("")
        .trim();
      if (resultText) lines.push(`ToolResult: ${resultText.slice(0, 500)}`);
    }
  }
  return lines.join("\n\n");
}

function extractHistorySection(existing: string): string {
  const match = /## Consolidation History\s*([\s\S]*)$/i.exec(existing);
  return match?.[1]?.trim() ?? "";
}

async function streamToText(agent: ReturnType<typeof defineAgent>, prompt: string): Promise<string> {
  let output = "";
  for await (const event of agent.stream(prompt)) {
    if (isRuntimeError(event)) {
      throw event.error instanceof Error ? event.error : new Error("LLM request failed");
    }
    if (event.type === "message_update" && event.event.type === "text_delta") {
      output += event.event.delta;
    }
    if (event.type === "agent_end") break;
  }
  return output.trim();
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${Date.now()}`;
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, filePath);
}

export class UserMemoryConsolidationService {
  private readonly inFlight = new Set<string>();
  private readonly activeForeground = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly dataDir: string,
    private readonly config: UserMemoryConfig,
  ) {}

  start(): void {
    if (this.config.enabled === false || this.timer) return;
    const intervalMs = Math.max(15_000, (this.config.scanIntervalMinutes ?? 1) * 60 * 1000);
    this.timer = setInterval(() => {
      void this.scanAllUsers();
    }, intervalMs);
    this.timer.unref?.();
    void this.scanAllUsers();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  beginForegroundActivity(tenantId: string, userId: string): void {
    const key = userKey(tenantId, userId);
    this.activeForeground.set(key, (this.activeForeground.get(key) ?? 0) + 1);
  }

  endForegroundActivity(tenantId: string, userId: string): void {
    const key = userKey(tenantId, userId);
    const next = (this.activeForeground.get(key) ?? 1) - 1;
    if (next <= 0) this.activeForeground.delete(key);
    else this.activeForeground.set(key, next);
    void this.processUserIfReady(tenantId, userId);
  }

  async touchActivity(tenantId: string, userId: string): Promise<void> {
    const state = await this.readState(tenantId, userId);
    state.lastActivityAt = Date.now();
    await this.writeState(tenantId, userId, state);
    void this.evaluateAndQueueUser(tenantId, userId);
  }

  async enqueueForceRebuild(tenantId: string, userId: string): Promise<void> {
    const state = await this.readState(tenantId, userId);
    state.pendingReason = "manual";
    await this.writeState(tenantId, userId, state);
    void this.processUserIfReady(tenantId, userId);
  }

  private async scanAllUsers(): Promise<void> {
    if (this.config.enabled === false) return;
    const tenantsDir = path.join(this.dataDir, "tenants");
    let tenantEntries;
    try {
      tenantEntries = await readdir(tenantsDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const tenantEntry of tenantEntries) {
      if (!tenantEntry.isDirectory()) continue;
      const tenantId = tenantEntry.name;
      const usersDir = path.join(tenantsDir, tenantId, "users");
      let userEntries;
      try {
        userEntries = await readdir(usersDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const userEntry of userEntries) {
        if (!userEntry.isDirectory()) continue;
        const userId = userEntry.name;
        await this.evaluateAndQueueUser(tenantId, userId);
        await this.processUserIfReady(tenantId, userId);
      }
    }
  }

  private async evaluateAndQueueUser(tenantId: string, userId: string): Promise<void> {
    const state = await this.readState(tenantId, userId);
    const sessions = await this.sessionManager.listSessionIdsByUser(
      tenantId,
      userId,
      Number.MAX_SAFE_INTEGER,
    );
    if (sessions.length === 0) return;

    const now = Date.now();
    const changedSessions = sessions.filter(
      (session) => session.updatedAt > state.lastProcessedSessionUpdatedAt,
    ).length;

    const needsInitialBuild = state.lastCompletedAt === 0;
    const exceedsInterval =
      state.lastCompletedAt > 0 &&
      now - state.lastCompletedAt >= (this.config.minIntervalHours ?? 24) * 60 * 60 * 1000;
    const exceedsChangedSessions = changedSessions >= (this.config.minChangedSessions ?? 5);

    if (needsInitialBuild || exceedsInterval || exceedsChangedSessions) {
      if (!state.pendingReason) {
        state.pendingReason = needsInitialBuild ? "initial" : "auto";
      }
      await this.writeState(tenantId, userId, state);
    }
  }

  private async processUserIfReady(tenantId: string, userId: string): Promise<void> {
    const key = userKey(tenantId, userId);
    if (this.inFlight.has(key) || (this.activeForeground.get(key) ?? 0) > 0) return;

    const state = await this.readState(tenantId, userId);
    if (!state.pendingReason) return;
    if (Date.now() - state.lastActivityAt < (this.config.idleMinutes ?? 10) * 60 * 1000) return;

    this.inFlight.add(key);
    try {
      await this.runConsolidation(tenantId, userId, state.pendingReason === "manual");
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async runConsolidation(
    tenantId: string,
    userId: string,
    forceRebuild: boolean,
  ): Promise<void> {
    const state = await this.readState(tenantId, userId);
    const sessions = await this.sessionManager.listSessionIdsByUser(
      tenantId,
      userId,
      Number.MAX_SAFE_INTEGER,
    );
    if (sessions.length === 0) return;

    for (const session of sessions) {
      const cached = await this.readSessionSummary(tenantId, session.sessionId);
      if (!forceRebuild && cached && cached.sessionUpdatedAt >= session.updatedAt) {
        continue;
      }

      const messages = await this.sessionManager.loadFullSessionMessages(tenantId, session.sessionId);
      const usableMessages = messages.filter((message: Message) => !isCompactionMessage(message));
      if (usableMessages.length < 4) continue;

      const transcript = renderMessages(usableMessages);
      if (!transcript.trim()) continue;

      const summary = await this.buildSessionSummary(tenantId, userId, session.sessionId, session.updatedAt, transcript);
      await this.writeSessionSummary(tenantId, session.sessionId, summary);
    }

    const sessionSummaries: SessionMemorySummary[] = [];
    for (const session of sessions) {
      const summary = await this.readSessionSummary(tenantId, session.sessionId);
      if (summary) sessionSummaries.push(summary);
    }

    if (sessionSummaries.length === 0) {
      state.lastCompletedAt = Date.now();
      state.lastProcessedSessionCount = sessions.length;
      state.lastProcessedSessionUpdatedAt = Math.max(...sessions.map((session) => session.updatedAt), 0);
      state.pendingReason = null;
      await this.writeState(tenantId, userId, state);
      return;
    }

    const profile = await this.buildUserProfile(sessionSummaries);
    const userMdPath = path.join(this.sessionManager.getUserDir(tenantId, userId), "USER.md");
    const existingUserMd = await readFile(userMdPath, "utf8").catch(() => "");
    const existingHistory = extractHistorySection(existingUserMd);
    const timestamp = new Date().toISOString();
    const historyEntry = [
      `### ${timestamp}`,
      ``,
      `- Trigger: ${forceRebuild ? "manual" : "idle-auto"}`,
      `- Sessions covered: ${sessionSummaries.length}`,
      `- Summary: ${profile.summary}`,
      ``,
    ].join("\n");

    const historyBody = [existingHistory, historyEntry].filter(Boolean).join("\n");
    const markdown = [
      `<!-- summary: ${profile.summary} -->`,
      ``,
      `# User Profile`,
      ``,
      `## Current Profile`,
      ``,
      profile.currentProfile,
      ``,
      `## Preferences`,
      ``,
      ...profile.preferences.map((item) => `- ${item}`),
      ``,
      `## Focus Areas`,
      ``,
      ...profile.focusAreas.map((item) => `- ${item}`),
      ``,
      `## Role / Context`,
      ``,
      ...profile.roleContext.map((item) => `- ${item}`),
      ``,
      `## Avoid`,
      ``,
      ...profile.avoid.map((item) => `- ${item}`),
      ``,
      `## Consolidation History`,
      ``,
      historyBody.trim(),
      ``,
    ].join("\n").replace(/\n{3,}/g, "\n\n");
    await atomicWrite(userMdPath, markdown);

    state.lastCompletedAt = Date.now();
    state.lastProcessedSessionCount = sessions.length;
    state.lastProcessedSessionUpdatedAt = Math.max(...sessions.map((session) => session.updatedAt), 0);
    state.pendingReason = null;
    await this.writeState(tenantId, userId, state);
  }

  private async buildSessionSummary(
    tenantId: string,
    userId: string,
    sessionId: string,
    sessionUpdatedAt: number,
    transcript: string,
  ): Promise<SessionMemorySummary> {
    const agent = defineAgent({
      id: "user-memory-session-extractor",
      model: {
        provider: this.config.provider,
        modelId: this.config.modelId,
        ...(this.config.apiKey ? { apiKey: this.config.apiKey } : {}),
        ...(this.config.baseUrl ? { baseUrl: this.config.baseUrl } : {}),
      },
      system: [
        "You extract durable user memory from a single conversation session.",
        "Return JSON only.",
        "Schema:",
        '{"preferences": string[], "focusAreas": string[], "roleContext": string[], "avoid": string[], "evidence": string[]}',
        "Rules:",
        "- Use the conversation language.",
        "- Be factual and concise.",
        "- Only include items supported by the transcript.",
        "- Keep each list item short.",
      ].join("\n"),
      maxTokens: 900,
      temperature: 0,
    });

    const raw = await streamToText(
      agent,
      `tenant_id=${tenantId}\nuser_id=${userId}\nsession_id=${sessionId}\n\nTranscript:\n${transcript}`,
    );
    const parsed = parseJsonBlock(raw) ?? {};
    return {
      sessionId,
      sessionUpdatedAt,
      generatedAt: Date.now(),
      preferences: normalizeList(parsed.preferences),
      focusAreas: normalizeList(parsed.focusAreas),
      roleContext: normalizeList(parsed.roleContext),
      avoid: normalizeList(parsed.avoid),
      evidence: normalizeList(parsed.evidence),
    };
  }

  private async buildUserProfile(sessionSummaries: SessionMemorySummary[]): Promise<UserProfileSummary> {
    const agent = defineAgent({
      id: "user-memory-profile-builder",
      model: {
        provider: this.config.provider,
        modelId: this.config.modelId,
        ...(this.config.apiKey ? { apiKey: this.config.apiKey } : {}),
        ...(this.config.baseUrl ? { baseUrl: this.config.baseUrl } : {}),
      },
      system: [
        "You build a durable USER.md profile from session memory summaries.",
        "Return JSON only.",
        "Schema:",
        '{"summary": string, "currentProfile": string, "preferences": string[], "focusAreas": string[], "roleContext": string[], "avoid": string[]}',
        "Rules:",
        "- Use the same language as the evidence.",
        "- summary must be one short line suitable for <!-- summary: ... -->.",
        "- currentProfile must be a short paragraph.",
        "- Keep lists factual and deduplicated.",
      ].join("\n"),
      maxTokens: 1200,
      temperature: 0,
    });

    const raw = await streamToText(
      agent,
      `Session summaries:\n${JSON.stringify(sessionSummaries, null, 2)}`,
    );
    const parsed = parseJsonBlock(raw) ?? {};
    return {
      summary: trimLine(parsed.summary, "User preferences and recurring focus areas"),
      currentProfile: trimLine(parsed.currentProfile, "Not enough information yet to build a stable profile."),
      preferences: normalizeList(parsed.preferences),
      focusAreas: normalizeList(parsed.focusAreas),
      roleContext: normalizeList(parsed.roleContext),
      avoid: normalizeList(parsed.avoid),
    };
  }

  private getStatePath(tenantId: string, userId: string): string {
    return path.join(this.sessionManager.getUserDir(tenantId, userId), STATE_FILE);
  }

  private async readState(tenantId: string, userId: string): Promise<UserMemoryState> {
    const statePath = this.getStatePath(tenantId, userId);
    try {
      const raw = await readFile(statePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<UserMemoryState>;
      return {
        lastActivityAt: typeof parsed.lastActivityAt === "number" ? parsed.lastActivityAt : 0,
        lastCompletedAt: typeof parsed.lastCompletedAt === "number" ? parsed.lastCompletedAt : 0,
        lastProcessedSessionCount: typeof parsed.lastProcessedSessionCount === "number" ? parsed.lastProcessedSessionCount : 0,
        lastProcessedSessionUpdatedAt: typeof parsed.lastProcessedSessionUpdatedAt === "number" ? parsed.lastProcessedSessionUpdatedAt : 0,
        pendingReason: typeof parsed.pendingReason === "string" ? parsed.pendingReason : null,
      };
    } catch {
      return {
        lastActivityAt: 0,
        lastCompletedAt: 0,
        lastProcessedSessionCount: 0,
        lastProcessedSessionUpdatedAt: 0,
        pendingReason: null,
      };
    }
  }

  private async writeState(tenantId: string, userId: string, state: UserMemoryState): Promise<void> {
    await atomicWrite(this.getStatePath(tenantId, userId), JSON.stringify(state, null, 2));
  }

  private getSessionSummaryPath(tenantId: string, sessionId: string): string {
    return path.join(this.sessionManager.getSessionDir(tenantId, sessionId), SESSION_SUMMARY_FILE);
  }

  private async readSessionSummary(
    tenantId: string,
    sessionId: string,
  ): Promise<SessionMemorySummary | null> {
    try {
      const raw = await readFile(this.getSessionSummaryPath(tenantId, sessionId), "utf8");
      return JSON.parse(raw) as SessionMemorySummary;
    } catch {
      return null;
    }
  }

  private async writeSessionSummary(
    tenantId: string,
    sessionId: string,
    summary: SessionMemorySummary,
  ): Promise<void> {
    await atomicWrite(
      this.getSessionSummaryPath(tenantId, sessionId),
      JSON.stringify(summary, null, 2),
    );
  }
}
