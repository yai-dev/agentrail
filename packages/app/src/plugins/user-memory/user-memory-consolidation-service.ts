/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { isCompactionMessage } from "@/session/session-manager.js";
import type { UserSessionLister } from "@/session/user-session-lister.js";
import type { AgentrailSessionStore, Message } from "@agentrail/core";
import { defineAgent, isRuntimeError } from "@agentrail/core";
import "@agentrail/core/providers";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Minimal interface for propagating host-side user-memo updates to live
 * sandbox mirrors. `SandboxManager` satisfies this interface.
 */
export interface UserMemoMirrorRefresher {
  refreshUserMemoMirrorForAllSessions(
    tenantId: string,
    userId: string,
    name: string,
    content: string,
  ): Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

const STATE_FILE = ".memory-state.json";
const SESSION_SUMMARY_FILE = "user-memory.json";

/** Maximum number of sessions fetched per user; bounds sessionSummaries array and LLM prompt size. */
const MAX_SESSIONS_PER_USER = 500;

// ============================================================================
// Public configuration type
// ============================================================================

/** Configuration for the user-memory consolidation plugin. */
export interface UserMemoryConfig {
  /** LLM provider identifier (e.g. "openai", "anthropic"). */
  provider: string;
  /** Model identifier passed to the provider. */
  modelId: string;
  /** Optional API key override; defaults to the environment-level key. */
  apiKey?: string;
  /** Optional base URL override for OpenAI-compatible endpoints. */
  baseUrl?: string;
  /** Set to false to disable the plugin entirely. Defaults to true. */
  enabled?: boolean;
  /** Minutes of user inactivity required before consolidation may start. Defaults to 10. */
  idleMinutes?: number;
  /** How often the background scanner checks all users (minutes). Defaults to 1. */
  scanIntervalMinutes?: number;
  /** Minimum hours between full profile rebuilds for a single user. Defaults to 24. */
  minIntervalHours?: number;
  /** Number of changed sessions that triggers an early rebuild. Defaults to 5. */
  minChangedSessions?: number;
}

// ============================================================================
// Internal types
// ============================================================================

interface UserMemoryState {
  lastActivityAt: number;
  lastCompletedAt: number;
  lastProcessedSessionCount: number;
  lastProcessedSessionUpdatedAt: number;
  pendingReason: string | null;
}

/** Per-session memory extracted by the session-extractor agent and cached on disk. */
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

/** Aggregate user profile produced by the profile-builder agent. */
interface UserProfileSummary {
  summary: string;
  currentProfile: string;
  preferences: string[];
  focusAreas: string[];
  roleContext: string[];
  avoid: string[];
}

type SessionMetaItem = { sessionId: string; updatedAt: number };

// ============================================================================
// Module-level helpers
// ============================================================================

function userKey(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}

/** Coerces an unknown LLM output value to a non-empty string array, capped at 12 items. */
function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function trimLine(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

/**
 * Parses a JSON object from LLM output that may be wrapped in a markdown
 * code fence or include surrounding prose.
 */
function parseJsonBlock(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]+?)\s*```$/i.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    // Fall back to extracting the first {...} substring when the model adds prose.
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

/**
 * Converts a message list into a compact plain-text transcript for the LLM.
 * Each content type is truncated so that even large sessions produce a
 * reasonably sized prompt.
 */
function renderMessages(messages: Message[]): string {
  const lines: string[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content.map((block) => ("text" in block ? (block.text ?? "") : "")).join("");
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
        .map((block) => (block.type === "text" ? (block.text ?? "") : ""))
        .join("")
        .trim();
      if (resultText) lines.push(`ToolResult: ${resultText.slice(0, 500)}`);
    }
  }

  return lines.join("\n\n");
}

/** Extracts the "## Consolidation History" section body from an existing USER.md. */
function extractHistorySection(existing: string): string {
  const match = /## Consolidation History\s*([\s\S]*)$/i.exec(existing);
  return match?.[1]?.trim() ?? "";
}

/** Renders a complete USER.md document from a freshly built profile. */
function renderUserMd(
  profile: UserProfileSummary,
  sessionSummaries: SessionMemorySummary[],
  existingHistory: string,
  trigger: "manual" | "idle-auto",
): string {
  const timestamp = new Date().toISOString();
  const historyEntry = [
    `### ${timestamp}`,
    ``,
    `- Trigger: ${trigger}`,
    `- Sessions covered: ${sessionSummaries.length}`,
    `- Summary: ${profile.summary}`,
    ``,
  ].join("\n");

  const historyBody = [existingHistory, historyEntry].filter(Boolean).join("\n");

  return [
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
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Accumulates all text tokens emitted by an agent stream; throws on runtime errors. */
async function streamToText(
  agent: ReturnType<typeof defineAgent>,
  prompt: string,
): Promise<string> {
  let output = "";
  for await (const event of agent.stream(prompt)) {
    if (isRuntimeError(event)) {
      throw event.error instanceof Error ? event.error : new Error("LLM request failed");
    }
    if (event.type === "message.update" && event.event.type === "text_delta") {
      output += event.event.delta;
    }
    if (event.type === "session.end") break;
  }
  return output.trim();
}

/** Writes `content` to a temp file then atomically renames it to `filePath`. */
async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${Date.now()}`;
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, filePath);
}

// ============================================================================
// Service class
// ============================================================================

/**
 * Background service that periodically scans all users and consolidates their
 * session history into a durable USER.md memory profile.
 *
 * Consolidation runs in two phases:
 *  1. Session summary — each changed session is summarised by an LLM agent and
 *     the result is cached beside the session data.
 *  2. Profile rebuild — all cached session summaries are aggregated into a
 *     single USER.md document that the main agent reads on every turn.
 *
 * Concurrency guarantees:
 *  - `scanning` flag prevents overlapping scan sweeps when a sweep takes
 *    longer than the configured interval.
 *  - `inFlight` set prevents duplicate consolidation runs for the same user.
 *  - `activeForeground` counter pauses consolidation while the user is active.
 */
export class UserMemoryConsolidationService {
  private readonly inFlight = new Set<string>();
  private readonly activeForeground = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Prevents a new scan sweep from starting before the previous one finishes. */
  private scanning = false;

  constructor(
    /**
     * Session store used to load session message history.
     * Accepts any `AgentrailSessionStore` implementation.
     */
    private readonly sessionStore: AgentrailSessionStore,
    /**
     * Provides user-scoped session listing for background scans.
     * `SessionManager` implements this interface automatically.
     */
    private readonly userSessionLister: UserSessionLister,
    /**
     * Host data directory used for state/summary cache files
     * (`.memory-state.json`, `user-memory.json`).
     */
    private readonly dataDir: string,
    private readonly config: UserMemoryConfig,
    /**
     * When provided, the service propagates USER.md updates to all live
     * sandbox mirrors so the agent immediately reads the updated content
     * from inside any currently-running container. Pass the `SandboxManager`
     * instance here when using a non-filesystem session store.
     */
    private readonly mirrorRefresher?: UserMemoMirrorRefresher,
  ) {}

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  start(): void {
    if (this.config.enabled === false || this.timer) return;
    const intervalMs = Math.max(15_000, (this.config.scanIntervalMinutes ?? 1) * 60 * 1000);
    this.timer = setInterval(() => {
      void this.scanAllUsers();
    }, intervalMs);
    // Unref so the timer does not keep the Node.js process alive after stop().
    this.timer.unref?.();
    void this.scanAllUsers();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  // --------------------------------------------------------------------------
  // Activity tracking (called by the plugin hooks)
  // --------------------------------------------------------------------------

  /** Increments the foreground counter, suppressing background consolidation. */
  beginForegroundActivity(tenantId: string, userId: string): void {
    const key = userKey(tenantId, userId);
    this.activeForeground.set(key, (this.activeForeground.get(key) ?? 0) + 1);
  }

  /** Decrements the foreground counter and triggers consolidation if now idle. */
  endForegroundActivity(tenantId: string, userId: string): void {
    const key = userKey(tenantId, userId);
    const next = (this.activeForeground.get(key) ?? 1) - 1;
    if (next <= 0) this.activeForeground.delete(key);
    else this.activeForeground.set(key, next);
    void this.processUserIfReady(tenantId, userId);
  }

  /** Records the current time as last-activity and re-evaluates whether consolidation is due. */
  async touchActivity(tenantId: string, userId: string): Promise<void> {
    const state = await this.readState(tenantId, userId);
    state.lastActivityAt = Date.now();
    await this.writeState(tenantId, userId, state);
    void this.evaluateAndQueueUser(tenantId, userId);
  }

  /** Marks the user for a forced profile rebuild regardless of thresholds. */
  async enqueueForceRebuild(tenantId: string, userId: string): Promise<void> {
    const state = await this.readState(tenantId, userId);
    state.pendingReason = "manual";
    await this.writeState(tenantId, userId, state);
    void this.processUserIfReady(tenantId, userId);
  }

  // --------------------------------------------------------------------------
  // Scheduling: scan → evaluate → process
  // --------------------------------------------------------------------------

  /**
   * Entry point called by the timer. Guards against concurrent invocations so
   * that a slow sweep cannot stack up on the next interval tick.
   */
  private async scanAllUsers(): Promise<void> {
    if (this.config.enabled === false) return;
    if (this.scanning) return;
    this.scanning = true;
    try {
      await this.scanAllUsersInner();
    } finally {
      this.scanning = false;
    }
  }

  /** Iterates every (tenantId, userId) pair on disk and processes each sequentially. */
  private async scanAllUsersInner(): Promise<void> {
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

  /**
   * Decides whether consolidation should be scheduled for a user by checking
   * three triggers: initial build, time-based interval, and changed-session count.
   * Writes `state.pendingReason` when any trigger fires.
   */
  private async evaluateAndQueueUser(tenantId: string, userId: string): Promise<void> {
    const state = await this.readState(tenantId, userId);
    const allSessions = await this.userSessionLister.listSessionsByUser(tenantId, userId);
    const sessions = allSessions.slice(0, MAX_SESSIONS_PER_USER);
    if (sessions.length === 0) return;

    const now = Date.now();
    const changedSessions = sessions.filter(
      (s) => s.updatedAt > state.lastProcessedSessionUpdatedAt,
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

  /**
   * Runs consolidation for a user when all preconditions are met:
   *  - Not already in flight for this user.
   *  - No active foreground session.
   *  - A `pendingReason` is set.
   *  - User has been idle for at least `idleMinutes`.
   */
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

  // --------------------------------------------------------------------------
  // Consolidation pipeline
  // --------------------------------------------------------------------------

  /**
   * Full consolidation pipeline for one user:
   *  1. Refresh stale per-session summaries via the session-extractor LLM agent.
   *  2. Aggregate all summaries into a new USER.md via the profile-builder agent.
   *  3. Persist updated completion markers.
   */
  private async runConsolidation(
    tenantId: string,
    userId: string,
    forceRebuild: boolean,
  ): Promise<void> {
    const state = await this.readState(tenantId, userId);
    const allSessions = await this.userSessionLister.listSessionsByUser(tenantId, userId);
    const sessions = allSessions.slice(0, MAX_SESSIONS_PER_USER);
    if (sessions.length === 0) return;

    // Phase 1: ensure every changed session has an up-to-date cached summary.
    await this.refreshSessionSummaries(tenantId, userId, sessions, forceRebuild);

    // Phase 2: aggregate all summaries and rewrite USER.md.
    const sessionSummaries = await this.collectSessionSummaries(tenantId, sessions);
    if (sessionSummaries.length > 0) {
      await this.rebuildUserProfile(tenantId, userId, sessionSummaries, forceRebuild);
    }

    // Persist completion markers so the next evaluation cycle knows where to resume.
    state.lastCompletedAt = Date.now();
    state.lastProcessedSessionCount = sessions.length;
    state.lastProcessedSessionUpdatedAt = Math.max(...sessions.map((s) => s.updatedAt), 0);
    state.pendingReason = null;
    await this.writeState(tenantId, userId, state);
  }

  /**
   * Phase 1 — For each session that is stale or force-rebuilt, loads the full
   * message history, renders it as a plain-text transcript, and calls the
   * session-extractor LLM agent to produce a `SessionMemorySummary`.
   */
  private async refreshSessionSummaries(
    tenantId: string,
    userId: string,
    sessions: SessionMetaItem[],
    forceRebuild: boolean,
  ): Promise<void> {
    for (const session of sessions) {
      const cached = await this.readSessionSummary(tenantId, session.sessionId);
      if (!forceRebuild && cached && cached.sessionUpdatedAt >= session.updatedAt) {
        continue;
      }

      const messages = await this.sessionStore.loadAllMessages(tenantId, session.sessionId);
      // Strip compaction placeholder messages; they add noise without useful content.
      const usableMessages = messages.filter((m: Message) => !isCompactionMessage(m));
      if (usableMessages.length < 4) continue;

      const transcript = renderMessages(usableMessages);
      if (!transcript.trim()) continue;

      const summary = await this.buildSessionSummary(
        tenantId,
        userId,
        session.sessionId,
        session.updatedAt,
        transcript,
      );
      await this.writeSessionSummary(tenantId, session.sessionId, summary);
    }
  }

  /** Reads cached summaries for the supplied session list; skips missing entries. */
  private async collectSessionSummaries(
    tenantId: string,
    sessions: SessionMetaItem[],
  ): Promise<SessionMemorySummary[]> {
    const summaries: SessionMemorySummary[] = [];
    for (const session of sessions) {
      const summary = await this.readSessionSummary(tenantId, session.sessionId);
      if (summary) summaries.push(summary);
    }
    return summaries;
  }

  /**
   * Phase 2 — Calls the profile-builder LLM agent to merge all session
   * summaries into a `UserProfileSummary`, then renders and writes USER.md.
   */
  private async rebuildUserProfile(
    tenantId: string,
    userId: string,
    sessionSummaries: SessionMemorySummary[],
    forceRebuild: boolean,
  ): Promise<void> {
    const profile = await this.buildUserProfile(sessionSummaries);

    let existingUserMd = "";
    if (this.sessionStore.readMemoryDocument) {
      existingUserMd =
        (await this.sessionStore.readMemoryDocument(tenantId, userId, "user", "USER.md")) ?? "";
    } else {
      throw new Error(
        `UserMemoryConsolidationService: the session store does not implement ` +
          `readMemoryDocument. Implement this method on your store — ` +
          `SessionManager implements it automatically for filesystem backends.`,
      );
    }

    const existingHistory = extractHistorySection(existingUserMd);
    const trigger = forceRebuild ? "manual" : "idle-auto";
    const newContent = renderUserMd(profile, sessionSummaries, existingHistory, trigger);

    if (this.sessionStore.writeMemoryDocument) {
      await this.sessionStore.writeMemoryDocument(tenantId, userId, "user", "USER.md", newContent);
    } else {
      throw new Error(
        `UserMemoryConsolidationService: the session store does not implement ` +
          `writeMemoryDocument. Implement this method on your store — ` +
          `SessionManager implements it automatically for filesystem backends.`,
      );
    }

    // Refresh the live sandbox mirrors so any currently-running agent
    // session immediately sees the updated USER.md inside the container.
    await this.mirrorRefresher
      ?.refreshUserMemoMirrorForAllSessions(tenantId, userId, "USER.md", newContent)
      .catch(() => {
        // Non-fatal: mirror refresh failure must not disrupt consolidation.
      });
  }

  // --------------------------------------------------------------------------
  // LLM agents
  // --------------------------------------------------------------------------

  /** Builds the model config object shared by both LLM agents. */
  private buildModelConfig() {
    return {
      provider: this.config.provider,
      modelId: this.config.modelId,
      ...(this.config.apiKey ? { apiKey: this.config.apiKey } : {}),
      ...(this.config.baseUrl ? { baseUrl: this.config.baseUrl } : {}),
    };
  }

  /**
   * Distils a single session transcript into structured memory fields
   * (preferences, focus areas, role context, avoidances, evidence).
   */
  private async buildSessionSummary(
    tenantId: string,
    userId: string,
    sessionId: string,
    sessionUpdatedAt: number,
    transcript: string,
  ): Promise<SessionMemorySummary> {
    const agent = defineAgent({
      id: "user-memory-session-extractor",
      model: this.buildModelConfig(),
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

  /**
   * Merges all session summaries into a coherent, deduplicated user profile
   * by calling the profile-builder LLM agent.
   */
  private async buildUserProfile(
    sessionSummaries: SessionMemorySummary[],
  ): Promise<UserProfileSummary> {
    const agent = defineAgent({
      id: "user-memory-profile-builder",
      model: this.buildModelConfig(),
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
      currentProfile: trimLine(
        parsed.currentProfile,
        "Not enough information yet to build a stable profile.",
      ),
      preferences: normalizeList(parsed.preferences),
      focusAreas: normalizeList(parsed.focusAreas),
      roleContext: normalizeList(parsed.roleContext),
      avoid: normalizeList(parsed.avoid),
    };
  }

  // --------------------------------------------------------------------------
  // Storage I/O
  // --------------------------------------------------------------------------

  private getStatePath(tenantId: string, userId: string): string {
    return path.join(this.dataDir, "tenants", tenantId, "users", userId, STATE_FILE);
  }

  private async readState(tenantId: string, userId: string): Promise<UserMemoryState> {
    try {
      const raw = await readFile(this.getStatePath(tenantId, userId), "utf8");
      const p = JSON.parse(raw) as Partial<UserMemoryState>;
      return {
        lastActivityAt: typeof p.lastActivityAt === "number" ? p.lastActivityAt : 0,
        lastCompletedAt: typeof p.lastCompletedAt === "number" ? p.lastCompletedAt : 0,
        lastProcessedSessionCount:
          typeof p.lastProcessedSessionCount === "number" ? p.lastProcessedSessionCount : 0,
        lastProcessedSessionUpdatedAt:
          typeof p.lastProcessedSessionUpdatedAt === "number" ? p.lastProcessedSessionUpdatedAt : 0,
        pendingReason: typeof p.pendingReason === "string" ? p.pendingReason : null,
      };
    } catch {
      // Return a zero-value state for new users or corrupted/missing files.
      return {
        lastActivityAt: 0,
        lastCompletedAt: 0,
        lastProcessedSessionCount: 0,
        lastProcessedSessionUpdatedAt: 0,
        pendingReason: null,
      };
    }
  }

  private async writeState(
    tenantId: string,
    userId: string,
    state: UserMemoryState,
  ): Promise<void> {
    await atomicWrite(this.getStatePath(tenantId, userId), JSON.stringify(state, null, 2));
  }

  private getSessionSummaryPath(tenantId: string, sessionId: string): string {
    return path.join(
      this.dataDir,
      "tenants",
      tenantId,
      "sessions",
      sessionId,
      SESSION_SUMMARY_FILE,
    );
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
