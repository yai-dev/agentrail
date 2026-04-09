/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Message, Usage } from "@agentrail/core";
import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { access, appendFile, constants, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import {
  buildCompactionMetadata,
  buildMemoryEntry,
  findLastTurnEvent,
  getNextCompactionArchiveId,
  LEGACY_BACKUP_FILE,
  readJsonlMessages,
  replaySessionInfo,
  statOrNull,
} from "@/session/session-manager-helpers.js";
import type { SessionRef } from "@agentrail/core";
import { createSessionRef, resolveSessionRef } from "@agentrail/core";
import type { TodoStorage } from "@agentrail/core";
import { estimateMessageTokens } from "@/session/token-estimator.js";
import { createFileSystemSessionTraceStore, type SessionTraceStore } from "@/session/trace-store.js";
import type {
  CompactionMetadata,
  MemoryIndex,
  SessionContextUsage,
  SessionHandle,
  SessionInfo,
  SessionInitEvent,
  SessionMeta,
  SessionTurnEvent,
} from "@agentrail/core";

/** Prefix used for synthetic compaction messages written to messages.jsonl. */
export const COMPACTION_MESSAGE_PREFIX = "[Conversation compacted at ";

/** Returns true if a message is a synthetic compaction placeholder (not real user input). */
export function isCompactionMessage(m: Message): boolean {
  if (m.role !== "user") return false;
  const text = typeof m.content === "string" ? m.content : "";
  return text.startsWith(COMPACTION_MESSAGE_PREFIX);
}

/** Parses the metadata encoded into a synthetic compaction placeholder message. */
export function parseCompactionMetadata(content: string): CompactionMetadata {
  return buildCompactionMetadata(content);
}

/**
 * File-backed session store used by hosted Agentrail applications.
 *
 * Sessions are stored beneath `{dataDir}/tenants/{tenantId}/sessions/{sessionId}`.
 *
 * @see {@link https://agentrail.run/concepts/sessions}
 * @see {@link https://agentrail.run/reference/session-store}
 */
export class SessionManager {
  constructor(private readonly dataDir: string) {}

  /**
   * Health probe: verifies that `dataDir` is writable.
   * Resolves when healthy; rejects with a descriptive error when not.
   */
  async ping(): Promise<void> {
    try {
      await access(this.dataDir, constants.W_OK);
    } catch {
      throw new Error(`Session data directory is not writable: ${this.dataDir}`);
    }
  }

  /** Returns the opaque session reference for a session. */
  getSessionRef(tenantId: string, sessionId: string): SessionRef {
    return createSessionRef(tenantId, sessionId);
  }

  /** Resolves an opaque session reference into its tenant/session identifiers. */
  resolveSessionRef(sessionRef: SessionRef): { tenantId: string; sessionId: string } {
    return resolveSessionRef(sessionRef);
  }

  /** Returns the absolute directory path for a session. */
  getSessionDir(tenantId: string, sessionId: string): string {
    return path.join(this.dataDir, "tenants", tenantId, "sessions", sessionId);
  }

  getTraceDir(tenantId: string, sessionId: string): string {
    return path.join(this.getSessionDir(tenantId, sessionId), "trace");
  }

  private getSubAgentLogDir(tenantId: string, sessionId: string): string {
    return path.join(this.getSessionDir(tenantId, sessionId), "subagent-logs");
  }

  private getTodoFilePath(tenantId: string, sessionId: string): string {
    return path.join(this.getSessionDir(tenantId, sessionId), "TODO.md");
  }

  /** Returns the absolute directory path for a user's shared memory files. */
  getUserDir(tenantId: string, userId: string): string {
    return path.join(this.dataDir, "tenants", tenantId, "users", userId);
  }

  /** Returns the directory that stores archived pre-compaction message logs. */
  getCompactionsDir(tenantId: string, sessionId: string): string {
    return path.join(this.getSessionDir(tenantId, sessionId), "messages.compactions");
  }

  /** Returns the archive path for one compacted message-history segment. */
  getCompactionArchivePath(tenantId: string, sessionId: string, archiveId: string): string {
    return path.join(this.getCompactionsDir(tenantId, sessionId), `${archiveId}.jsonl`);
  }

  /**
   * Lists sessions belonging to a user, sorted by last activity (updatedAt) descending.
   * Used for cross-session user preference summarization.
   *
   * @param limit  Maximum number of sessions to return (default 10).
   */
  async listSessionIdsByUser(tenantId: string, userId: string, limit = 10): Promise<SessionMeta[]> {
    const sessionsDir = path.join(this.dataDir, "tenants", tenantId, "sessions");
    let entries: Dirent[];
    try {
      entries = (await readdir(sessionsDir, { withFileTypes: true })) as Dirent[];
    } catch {
      return [];
    }

    const metas: SessionMeta[] = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const sessionId = ent.name;
      try {
        const info = await this.readSessionInfo(tenantId, sessionId);
        if (info.userId === userId) {
          metas.push({ sessionId: info.sessionId, updatedAt: info.updatedAt });
        }
      } catch {
        // Corrupted or missing session.jsonl — skip
      }
    }

    metas.sort((a, b) => b.updatedAt - a.updatedAt);
    return metas.slice(0, limit);
  }

  private async getNextCompactionArchiveId(tenantId: string, sessionId: string): Promise<string> {
    return getNextCompactionArchiveId(this.getCompactionsDir(tenantId, sessionId));
  }

  private async readJsonlMessages(filePath: string): Promise<Message[]> {
    return readJsonlMessages(filePath);
  }

  private async expandCompactionPlaceholders(
    tenantId: string,
    sessionId: string,
    messages: Message[],
    seenArchiveIds = new Set<string>(),
  ): Promise<Message[]> {
    const expanded: Message[] = [];

    for (const message of messages) {
      if (!isCompactionMessage(message) || typeof message.content !== "string") {
        expanded.push(message);
        continue;
      }

      const { archiveId } = parseCompactionMetadata(message.content);
      if (archiveId) {
        if (seenArchiveIds.has(archiveId)) continue;
        seenArchiveIds.add(archiveId);
        const archiveMessages = await this.readJsonlMessages(
          this.getCompactionArchivePath(tenantId, sessionId, archiveId),
        );
        expanded.push(
          ...(await this.expandCompactionPlaceholders(
            tenantId,
            sessionId,
            archiveMessages,
            seenArchiveIds,
          )),
        );
        continue;
      }

      const legacyBackup = await this.readJsonlMessages(
        path.join(this.getSessionDir(tenantId, sessionId), LEGACY_BACKUP_FILE),
      );
      if (legacyBackup.length > 0) {
        expanded.push(
          ...(await this.expandCompactionPlaceholders(
            tenantId,
            sessionId,
            legacyBackup,
            seenArchiveIds,
          )),
        );
      }
    }

    return expanded;
  }

  /**
   * Creates the session directory if needed and writes the init event to session.jsonl.
   * If sessionId is omitted a new UUID is generated.
   */
  async getOrCreate(
    tenantId: string,
    userId: string,
    agentId: string,
    sessionId?: string,
  ): Promise<SessionHandle> {
    const sid = sessionId ?? randomUUID();
    const sessionDir = this.getSessionDir(tenantId, sid);
    const userDir = this.getUserDir(tenantId, userId);

    await mkdir(sessionDir, { recursive: true });
    await mkdir(userDir, { recursive: true });

    const sessionFile = path.join(sessionDir, "session.jsonl");
    const exists = await statOrNull(sessionFile);

    if (!exists) {
      const now = Date.now();
      const initEvent: SessionInitEvent = {
        type: "init",
        sessionId: sid,
        tenantId,
        userId,
        agentId,
        title: null,
        createdAt: now,
      };
      await appendFile(sessionFile, JSON.stringify(initEvent) + "\n", "utf8");
    }

    return {
      ...(await this.readSessionInfo(tenantId, sid)),
      sessionRef: this.getSessionRef(tenantId, sid),
    };
  }

  /** Replays session.jsonl events to build the current SessionInfo snapshot. */
  async readSessionInfo(tenantId: string, sessionId: string): Promise<SessionInfo> {
    const sessionFile = path.join(this.getSessionDir(tenantId, sessionId), "session.jsonl");
    const raw = await readFile(sessionFile, "utf8");
    return replaySessionInfo(sessionId, raw);
  }

  /**
   * Reads messages.jsonl and returns the last `limit` messages.
   * Returns an empty array when the file does not exist yet.
   */
  async loadMessages(tenantId: string, sessionId: string, limit = 50): Promise<Message[]> {
    const messagesFile = path.join(this.getSessionDir(tenantId, sessionId), "messages.jsonl");
    try {
      const raw = await readFile(messagesFile, "utf8");
      const lines = raw.trim().split("\n").filter(Boolean);
      const all = lines.map((l) => JSON.parse(l) as Message);
      return all.slice(-limit);
    } catch {
      return [];
    }
  }

  /**
   * Reads messages.jsonl.bak and returns the first `count` messages.
   * Used to expand compressed history in the UI.
   * If `count` is 0 or omitted, returns all messages from the backup.
   * Returns an empty array if no backup exists.
   */
  async loadCompactedMessages(
    tenantId: string,
    sessionId: string,
    count = 0,
    archiveId?: string,
  ): Promise<Message[]> {
    if (archiveId) {
      const archived = await this.readJsonlMessages(
        this.getCompactionArchivePath(tenantId, sessionId, archiveId),
      );
      return this.expandCompactionPlaceholders(tenantId, sessionId, archived);
    }

    const legacyBackup = await this.readJsonlMessages(
      path.join(this.getSessionDir(tenantId, sessionId), LEGACY_BACKUP_FILE),
    );
    return count > 0 ? legacyBackup.slice(0, count) : legacyBackup;
  }

  /**
   * Reads the full messages.jsonl without any limit.
   * Prefer loadMessages or loadMessagesWithBudget for regular use.
   */
  async loadAllMessages(tenantId: string, sessionId: string): Promise<Message[]> {
    const messagesFile = path.join(this.getSessionDir(tenantId, sessionId), "messages.jsonl");
    return this.readJsonlMessages(messagesFile);
  }

  /**
   * Reads the full conversation history, expanding all archived compaction
   * segments back into the original message stream.
   */
  async loadFullSessionMessages(tenantId: string, sessionId: string): Promise<Message[]> {
    const current = await this.loadAllMessages(tenantId, sessionId);
    return this.expandCompactionPlaceholders(tenantId, sessionId, current);
  }

  /**
   * Reads messages.jsonl and returns the most-recent messages whose combined
   * estimated token count fits within tokenBudget.  Iterates from the end of
   * the file backwards so the latest context is always included first.
   *
   * Falls back to loadMessages(50) if the file is unreadable.
   */
  async loadMessagesWithBudget(
    tenantId: string,
    sessionId: string,
    tokenBudget = 40_000,
  ): Promise<Message[]> {
    const all = await this.loadAllMessages(tenantId, sessionId);
    if (all.length === 0) return [];

    let tokens = 0;
    let cutIdx = all.length;
    for (let i = all.length - 1; i >= 0; i--) {
      tokens += estimateMessageTokens([all[i]!]);
      if (tokens > tokenBudget) {
        cutIdx = i + 1;
        break;
      }
      cutIdx = i;
    }
    return all.slice(cutIdx);
  }

  /** Appends new messages to messages.jsonl (one JSON object per line). */
  async appendMessages(tenantId: string, sessionId: string, messages: Message[]): Promise<void> {
    if (messages.length === 0) return;
    const messagesFile = path.join(this.getSessionDir(tenantId, sessionId), "messages.jsonl");
    const lines = messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
    await appendFile(messagesFile, lines, "utf8");
  }

  /**
   * Builds a lightweight MemoryIndex by reading file metadata and the
   * <!-- summary: ... --> annotation — does NOT load full file contents.
   */
  async buildMemoryIndex(
    tenantId: string,
    userId: string,
    sessionId: string,
  ): Promise<MemoryIndex> {
    const sessionDir = this.getSessionDir(tenantId, sessionId);
    const userDir = this.getUserDir(tenantId, userId);

    const [notes, todo, user] = await Promise.all([
      buildMemoryEntry("NOTES.md", path.join(sessionDir, "NOTES.md")),
      buildMemoryEntry("TODO.md", path.join(sessionDir, "TODO.md")),
      buildMemoryEntry("USER.md", path.join(userDir, "USER.md")),
    ]);

    return { sessionDir, userDir, entries: [notes, todo, user] };
  }

  async readTodoFile(sessionRef: SessionRef): Promise<string | null> {
    const { tenantId, sessionId } = this.resolveSessionRef(sessionRef);
    try {
      return await readFile(this.getTodoFilePath(tenantId, sessionId), "utf8");
    } catch {
      return null;
    }
  }

  async writeTodoFile(sessionRef: SessionRef, content: string): Promise<void> {
    const { tenantId, sessionId } = this.resolveSessionRef(sessionRef);
    const todoFilePath = this.getTodoFilePath(tenantId, sessionId);
    await mkdir(path.dirname(todoFilePath), { recursive: true });
    await writeFile(todoFilePath, content, "utf8");
  }

  createTodoStorage(sessionRef: SessionRef): TodoStorage {
    return {
      read: () => this.readTodoFile(sessionRef),
      write: (content) => this.writeTodoFile(sessionRef, content),
    };
  }

  createTraceStorage<TEnvelope = Record<string, unknown>>(
    sessionRef: SessionRef,
  ): SessionTraceStore<TEnvelope> {
    return createFileSystemSessionTraceStore<TEnvelope>(this.dataDir, sessionRef);
  }

  async persistSkillSubAgentLog(
    sessionRef: SessionRef,
    entry: {
      skillName: string;
      task: string;
      input: string;
      systemPrompt: string;
      messages: unknown[];
      resultText: string;
      startedAt: number;
      finishedAt: number;
    },
  ): Promise<void> {
    const { tenantId, sessionId } = this.resolveSessionRef(sessionRef);
    const logDir = this.getSubAgentLogDir(tenantId, sessionId);
    // Sanitise skillName to prevent path traversal: replace any character that
    // is not alphanumeric, hyphen, underscore, or dot with an underscore.
    const safeSkillName = entry.skillName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `skill-${safeSkillName}-${entry.startedAt}.jsonl`;
    const filePath = path.join(logDir, filename);

    await mkdir(logDir, { recursive: true });
    const lines: string[] = [
      JSON.stringify({
        type: "meta",
        skillName: entry.skillName,
        task: entry.task,
        input: entry.input,
        systemPrompt: entry.systemPrompt,
        resultText: entry.resultText,
        startedAt: entry.startedAt,
        finishedAt: entry.finishedAt,
        durationMs: entry.finishedAt - entry.startedAt,
      }),
      ...entry.messages.map((message) => JSON.stringify(message)),
      "",
    ];
    await appendFile(filePath, lines.join("\n"), "utf8");
  }

  /** Permanently removes the session directory and all its contents. */
  async deleteSession(tenantId: string, sessionId: string): Promise<void> {
    const sessionDir = this.getSessionDir(tenantId, sessionId);
    await rm(sessionDir, { recursive: true, force: true });
  }

  /** Appends a turn event to session.jsonl, including provider cache token fields. */
  async recordTurn(tenantId: string, sessionId: string, usage: Usage): Promise<void> {
    const sessionFile = path.join(this.getSessionDir(tenantId, sessionId), "session.jsonl");
    const raw = await readFile(sessionFile, "utf8");
    const turnIndex = raw
      .trim()
      .split("\n")
      .filter((l) => {
        try {
          return (JSON.parse(l) as { type: string }).type === "turn";
        } catch {
          return false;
        }
      }).length;

    const event: SessionTurnEvent = {
      type: "turn",
      turnIndex,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      cacheReadTokens: usage.cacheReadTokens ?? 0,
      cacheWriteTokens: usage.cacheWriteTokens ?? 0,
      updatedAt: Date.now(),
    };
    await appendFile(sessionFile, JSON.stringify(event) + "\n", "utf8");
  }

  /**
   * Compacts the oldest fraction of the conversation history and rewrites
   * messages.jsonl with a synthetic placeholder plus the retained tail.
   *
   * The compacted segment is archived in messages.compactions/{archiveId}.jsonl.
   * This keeps multiple manual/automatic compactions safe and recoverable.
   */
  async compactSession(
    tenantId: string,
    sessionId: string,
    summarizeFn: (messages: Message[]) => Promise<string>,
    options: {
      triggerTokens?: number;
      compactFraction?: number;
      force?: boolean;
      /** Pre-loaded messages to avoid an extra loadAllMessages round-trip. */
      preloadedMessages?: Message[];
      /**
       * Snapshot of the sandbox workspace file listing at the time of compaction.
       * When provided, appended to the compaction summary message so the agent
       * retains awareness of files created during the compacted conversation.
       */
      workspaceSnapshot?: string;
    } = {},
  ): Promise<{
    archiveId: string;
    compressedCount: number;
    totalTokens: number;
  } | null> {
    const {
      triggerTokens = 60_000,
      compactFraction = 1 / 3,
      workspaceSnapshot,
      force = false,
    } = options;

    const all = options.preloadedMessages ?? (await this.loadAllMessages(tenantId, sessionId));
    if (all.length < 6) return null; // too few messages to compact meaningfully

    const totalTokens = estimateMessageTokens(all);
    if (!force && totalTokens <= triggerTokens) return null;

    // Split: compact oldest fraction, keep the rest.
    // Advance the cut boundary past any toolResult messages to avoid orphaned
    // tool results: a toolResult must always have its corresponding toolCall
    // visible in the same context window.
    let cutPoint = Math.max(1, Math.floor(all.length * compactFraction));
    while (cutPoint < all.length - 1 && all[cutPoint]!.role === "toolResult") {
      cutPoint++;
    }
    // Edge case: first loop stopped at all.length-1 and it's still a toolResult
    // (entire tail is toolResults). Pull back until toKeep starts on a safe boundary.
    while (cutPoint > 1 && all[cutPoint]!.role === "toolResult") {
      cutPoint--;
    }

    const toCompact = all.slice(0, cutPoint);
    const toKeep = all.slice(cutPoint);

    const summary = await summarizeFn(toCompact);
    const timestamp = new Date().toISOString();
    const archiveId = await this.getNextCompactionArchiveId(tenantId, sessionId);

    // Build the synthetic replacement message (UserMessage shape)
    const compactionLines = [
      `[Conversation compacted at ${timestamp}. Full history preserved in messages.compactions/${archiveId}.jsonl.`,
      `Archive ID: ${archiveId}`,
      `${toCompact.length} messages (${Math.round(
        totalTokens * compactFraction,
      )} tokens estimated) were compressed.`,
      ``,
      `Summary of compressed conversation:`,
      summary,
    ];

    if (workspaceSnapshot && workspaceSnapshot.trim().length > 0) {
      compactionLines.push(
        ``,
        `Sandbox workspace at time of compaction:`,
        workspaceSnapshot.trim(),
      );
    }

    compactionLines.push(`]`);

    const compactionMessage: Message = {
      role: "user",
      content: compactionLines.join("\n"),
      timestamp: Date.now(),
    } as Message;

    const sessionDir = this.getSessionDir(tenantId, sessionId);
    const messagesFile = path.join(sessionDir, "messages.jsonl");
    const archiveFile = this.getCompactionArchivePath(tenantId, sessionId, archiveId);
    const notesFile = path.join(sessionDir, "NOTES.md");

    await mkdir(this.getCompactionsDir(tenantId, sessionId), { recursive: true });

    // Persist the compacted slice before rewriting the visible message log.
    const archivedLines = toCompact.map((m) => JSON.stringify(m)).join("\n") + "\n";
    await writeFile(archiveFile, archivedLines, "utf8");

    // Rewrite messages.jsonl with compaction message + retained history
    const newLines = [compactionMessage, ...toKeep].map((m) => JSON.stringify(m)).join("\n") + "\n";
    await writeFile(messagesFile, newLines, "utf8");

    // Append summary to NOTES.md so Memory Index picks it up on next request
    const notesEntry = [
      ``,
      `## Compaction Summary [${timestamp}]`,
      ``,
      `*(${toCompact.length} messages compressed, full history in \`messages.compactions/${archiveId}.jsonl\`)*`,
      ``,
      summary,
      ``,
    ].join("\n");
    await appendFile(notesFile, notesEntry, "utf8");

    return {
      archiveId,
      compressedCount: toCompact.length,
      totalTokens,
    };
  }

  /**
   * Layer 3 proactive compaction wrapper used by the request path.
   * Returns true if compaction was performed, false otherwise.
   */
  async compactIfNeeded(
    tenantId: string,
    sessionId: string,
    summarizeFn: (messages: Message[]) => Promise<string>,
    options: {
      triggerTokens?: number;
      compactFraction?: number;
      preloadedMessages?: Message[];
      workspaceSnapshot?: string;
    } = {},
  ): Promise<boolean> {
    const result = await this.compactSession(tenantId, sessionId, summarizeFn, options);
    return result !== null;
  }

  /**
   * Returns the context window usage snapshot from the most recent turn event
   * in session.jsonl, or null if no turn has been recorded yet.
   *
   * totalInputTokens = inputTokens + cacheReadTokens + cacheWriteTokens
   * (Anthropic prompt caching: inputTokens alone only counts non-cached tokens)
   */
  async getLastContextUsage(
    tenantId: string,
    sessionId: string,
  ): Promise<SessionContextUsage | null> {
    const sessionFile = path.join(this.getSessionDir(tenantId, sessionId), "session.jsonl");
    try {
      const raw = await readFile(sessionFile, "utf8");
      const last = findLastTurnEvent(raw);
      if (!last) return null;
      const totalInput =
        (last.inputTokens ?? 0) + (last.cacheReadTokens ?? 0) + (last.cacheWriteTokens ?? 0);
      return {
        inputTokens: totalInput,
        outputTokens: last.outputTokens ?? 0,
        budgetUsedPct: Math.round((totalInput / 200_000) * 100),
      };
    } catch {
      return null;
    }
  }
}
