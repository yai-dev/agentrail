/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SessionRef } from "@agentrail/core";
import { resolveSessionRef } from "@agentrail/core";
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DeepResearchEvent, DeepResearchState } from "@/types.js";

const STATE_FILE = "state.json";
const EVENTS_FILE = "events.jsonl";
const LATEST_FILE = "latest-run.json";

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getSessionRootDir(dataDir: string, sessionRef: SessionRef): string {
  const { tenantId, sessionId } = resolveSessionRef(sessionRef);
  return path.join(dataDir, "tenants", tenantId, "sessions", sessionId);
}

// Deep Research persistence is intentionally simple: every run has a snapshot
// state file plus an append-only event log so the UI can recover the latest run
// and developers can inspect the raw execution history on disk.
export interface DeepResearchStore {
  getArtifactsDir(runId: string): string;
  initializeRun(state: DeepResearchState): Promise<void>;
  appendEvent(runId: string, event: DeepResearchEvent): Promise<void>;
  writeState(state: DeepResearchState): Promise<void>;
  loadState(runId: string): Promise<DeepResearchState | null>;
  loadEvents(runId: string): Promise<DeepResearchEvent[]>;
  loadLatestState(): Promise<DeepResearchState | null>;
}

class FileSystemDeepResearchStore implements DeepResearchStore {
  constructor(private readonly sessionRootDir: string) {}

  private getRootDir(): string {
    return path.join(this.sessionRootDir, "deep-research");
  }

  private getRunsDir(): string {
    return path.join(this.getRootDir(), "runs");
  }

  private getRunDir(runId: string): string {
    return path.join(this.getRunsDir(), runId);
  }

  getArtifactsDir(runId: string): string {
    return path.join(this.getRunDir(runId), "artifacts");
  }

  async initializeRun(state: DeepResearchState): Promise<void> {
    const runDir = this.getRunDir(state.run.id);
    await mkdir(path.join(runDir, "artifacts"), { recursive: true });
    await Promise.all([
      writeFile(path.join(runDir, STATE_FILE), JSON.stringify(state, null, 2), "utf-8"),
      writeFile(
        path.join(this.getRootDir(), LATEST_FILE),
        JSON.stringify({ runId: state.run.id }, null, 2),
        "utf-8",
      ),
    ]);
  }

  async appendEvent(runId: string, event: DeepResearchEvent): Promise<void> {
    const runDir = this.getRunDir(runId);
    await mkdir(runDir, { recursive: true });
    await appendFile(path.join(runDir, EVENTS_FILE), `${JSON.stringify(event)}\n`, "utf-8");
  }

  async writeState(state: DeepResearchState): Promise<void> {
    const runDir = this.getRunDir(state.run.id);
    await mkdir(runDir, { recursive: true });
    await writeFile(path.join(runDir, STATE_FILE), JSON.stringify(state, null, 2), "utf-8");
    await writeFile(
      path.join(this.getRootDir(), LATEST_FILE),
      JSON.stringify({ runId: state.run.id }, null, 2),
      "utf-8",
    );
  }

  async loadState(runId: string): Promise<DeepResearchState | null> {
    return readJsonFile<DeepResearchState>(path.join(this.getRunDir(runId), STATE_FILE));
  }

  async loadEvents(runId: string): Promise<DeepResearchEvent[]> {
    try {
      const raw = await readFile(path.join(this.getRunDir(runId), EVENTS_FILE), "utf-8");
      return raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as DeepResearchEvent);
    } catch {
      return [];
    }
  }

  async loadLatestState(): Promise<DeepResearchState | null> {
    const latest = await readJsonFile<{ runId?: string }>(
      path.join(this.getRootDir(), LATEST_FILE),
    );
    if (latest?.runId) {
      return this.loadState(latest.runId);
    }

    try {
      const entries = await readdir(this.getRunsDir());
      const enriched = await Promise.all(
        entries.map(async (entry) => {
          const statePath = path.join(this.getRunDir(entry), STATE_FILE);
          const fileStat = await stat(statePath).catch(() => null);
          return fileStat ? { entry, mtimeMs: fileStat.mtimeMs } : null;
        }),
      );
      const latestEntry = enriched
        .filter((item): item is { entry: string; mtimeMs: number } => item !== null)
        .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
      return latestEntry ? this.loadState(latestEntry.entry) : null;
    } catch {
      return null;
    }
  }
}

/** Creates the default filesystem-backed Deep Research store for a session. */
export function createFileSystemDeepResearchStore(
  dataDir: string,
  sessionRef: SessionRef,
): DeepResearchStore {
  return new FileSystemDeepResearchStore(getSessionRootDir(dataDir, sessionRef));
}
