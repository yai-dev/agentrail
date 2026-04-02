/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import type { Message } from "@agentrail/runtime-core";
import type {
  CompactionMetadata,
  MemoryIndexEntry,
  SessionInfo,
  SessionInitEvent,
  SessionTurnEvent,
} from "./types.js";
import { estimateFileTokens } from "./token-estimator.js";

const SUMMARY_RE = /<!--\s*summary:\s*(.+?)\s*-->/;
const COMPACTION_ARCHIVE_RE = /Archive ID:\s*([0-9]{4,})/i;
const COMPRESSED_COUNT_RE = /(\d+)\s+messages\s+\(\d+\s+tokens estimated\)\s+were compressed/i;

/** Legacy backup file used by older compaction implementations. */
export const LEGACY_BACKUP_FILE = "messages.jsonl.bak";

export async function extractSummary(filePath: string): Promise<string | null> {
  try {
    const buf = await readFile(filePath, { encoding: "utf8" });
    const head = buf.slice(0, 512);
    const match = SUMMARY_RE.exec(head);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

export async function statOrNull(filePath: string) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

export async function buildMemoryEntry(name: string, filePath: string): Promise<MemoryIndexEntry> {
  const fileStat = await statOrNull(filePath);
  if (!fileStat) {
    return {
      name,
      path: filePath,
      exists: false,
      sizeTokensApprox: 0,
      updatedAt: null,
      summary: null,
    };
  }

  return {
    name,
    path: filePath,
    exists: true,
    sizeTokensApprox: estimateFileTokens(fileStat.size),
    updatedAt: fileStat.mtimeMs,
    summary: await extractSummary(filePath),
  };
}

export async function readJsonlMessages(filePath: string): Promise<Message[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Message);
  } catch {
    return [];
  }
}

/** Replays `session.jsonl` events into a current `SessionInfo` snapshot. */
export function replaySessionInfo(sessionId: string, raw: string): SessionInfo {
  const lines = raw.trim().split("\n").filter(Boolean);
  let info: SessionInfo | undefined;

  for (const line of lines) {
    const event = JSON.parse(line) as { type: string; [key: string]: unknown };
    if (event.type === "init") {
      const initEvent = event as unknown as SessionInitEvent;
      info = {
        sessionId: initEvent.sessionId,
        tenantId: initEvent.tenantId,
        userId: initEvent.userId,
        agentId: initEvent.agentId,
        title: initEvent.title,
        createdAt: initEvent.createdAt,
        updatedAt: initEvent.createdAt,
      };
      continue;
    }

    if (event.type === "turn" && info) {
      info.updatedAt = (event as unknown as SessionTurnEvent).updatedAt;
      continue;
    }

    if (event.type === "update" && info) {
      if (typeof event.title === "string") {
        info.title = event.title;
      }
      if (typeof event.updatedAt === "number") {
        info.updatedAt = event.updatedAt;
      }
    }
  }

  if (!info) {
    throw new Error(`Corrupted session.jsonl for session ${sessionId}`);
  }

  return info;
}

/** Returns the most recent persisted `turn` event from a raw session event log. */
export function findLastTurnEvent(raw: string): SessionTurnEvent | null {
  const lines = raw.trim().split("\n").filter(Boolean);
  let lastTurn: SessionTurnEvent | null = null;

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as { type: string };
      if (event.type === "turn") {
        lastTurn = event as unknown as SessionTurnEvent;
      }
    } catch {
      // Ignore malformed session history lines during best-effort reconstruction.
    }
  }

  return lastTurn;
}

/** Parses synthetic compaction message text into structured metadata. */
export function buildCompactionMetadata(content: string): CompactionMetadata {
  const archiveId = COMPACTION_ARCHIVE_RE.exec(content)?.[1] ?? null;
  const countRaw = COMPRESSED_COUNT_RE.exec(content)?.[1];
  return {
    archiveId,
    compressedCount: countRaw ? parseInt(countRaw, 10) : 0,
  };
}

export async function getNextCompactionArchiveId(compactionsDir: string): Promise<string> {
  await mkdir(compactionsDir, { recursive: true });

  let entries: string[];
  try {
    entries = await readdir(compactionsDir);
  } catch {
    entries = [];
  }

  const maxId = entries.reduce((max, entry) => {
    const match = /^(\d+)\.jsonl$/.exec(entry);
    if (!match) {
      return max;
    }

    return Math.max(max, parseInt(match[1] ?? "0", 10));
  }, 0);

  return String(maxId + 1).padStart(4, "0");
}
