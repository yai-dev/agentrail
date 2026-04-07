/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { recoverOrchestrationState, type RecoveredOrchestrationState } from "./recovery.js";
import type {
  OrchestrationEvent,
  OrchestrationMailboxEvent,
  OrchestrationMailboxState,
  OrchestrationSnapshot,
} from "./types.js";

const ORCHESTRATION_DIRECTORY = "orchestration";
const EVENTS_FILE = "events.jsonl";
const CHECKPOINT_FILE = "checkpoint.json";
const SUBAGENTS_DIRECTORY = "subagents";
const MAILBOX_FILE = "mailbox.jsonl";
const MAILBOX_STATE_FILE = "mailbox-state.json";

/** Filesystem-backed orchestration store scoped to one session root directory. */
export interface FilesystemOrchestrationStore {
  appendEvent(event: OrchestrationEvent): Promise<void>;
  loadEvents(): Promise<OrchestrationEvent[]>;
  loadSnapshot(): Promise<OrchestrationSnapshot | null>;
  writeCheckpoint(snapshot: OrchestrationSnapshot): Promise<void>;
  recoverState(): Promise<RecoveredOrchestrationState>;
  appendMailboxEvent(agentId: string, event: OrchestrationMailboxEvent): Promise<void>;
  loadMailboxEvents(agentId: string): Promise<OrchestrationMailboxEvent[]>;
  loadMailboxState(agentId: string): Promise<OrchestrationMailboxState>;
  writeMailboxState(agentId: string, state: OrchestrationMailboxState): Promise<void>;
  loadAgentHistory(agentId: string): Promise<unknown[]>;
  writeAgentHistory(agentId: string, history: unknown[]): Promise<void>;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === "ENOENT"
  );
}

function isInvalidSnapshotError(error: unknown): error is SyntaxError {
  return error instanceof SyntaxError;
}

/**
 * Creates a session-scoped filesystem orchestration store rooted at one private
 * session directory. Callers should prefer higher-level persistence adapters
 * unless they are already operating inside package-internal filesystem code.
 */
export function createFilesystemOrchestrationStore(rootDir: string): FilesystemOrchestrationStore {
  const orchestrationDirectory = join(rootDir, ORCHESTRATION_DIRECTORY);
  const getEventsPath = () => join(orchestrationDirectory, EVENTS_FILE);
  const getCheckpointPath = () => join(orchestrationDirectory, CHECKPOINT_FILE);
  const getSubAgentDirectory = (agentId: string) =>
    join(orchestrationDirectory, SUBAGENTS_DIRECTORY, agentId);
  const getMailboxPath = (agentId: string) => join(getSubAgentDirectory(agentId), MAILBOX_FILE);
  const getMailboxStatePath = (agentId: string) =>
    join(getSubAgentDirectory(agentId), MAILBOX_STATE_FILE);
  const getHistoryPath = (agentId: string) => join(getSubAgentDirectory(agentId), "history.json");

  const ensureOrchestrationDirectory = async (): Promise<void> => {
    await mkdir(orchestrationDirectory, { recursive: true });
  };

  const ensureSubAgentDirectory = async (agentId: string): Promise<void> => {
    await mkdir(getSubAgentDirectory(agentId), { recursive: true });
  };

  return {
    async appendEvent(event: OrchestrationEvent): Promise<void> {
      await ensureOrchestrationDirectory();
      await appendFile(getEventsPath(), `${JSON.stringify(event)}\n`, "utf8");
    },
    async loadEvents(): Promise<OrchestrationEvent[]> {
      try {
        const contents = await readFile(getEventsPath(), "utf8");
        return contents
          .split("\n")
          .filter((line) => line.trim().length > 0)
          .map((line) => JSON.parse(line) as OrchestrationEvent);
      } catch (error) {
        if (isMissingFileError(error)) {
          return [];
        }

        throw error;
      }
    },
    async loadSnapshot(): Promise<OrchestrationSnapshot | null> {
      try {
        const contents = await readFile(getCheckpointPath(), "utf8");
        return JSON.parse(contents) as OrchestrationSnapshot;
      } catch (error) {
        if (isMissingFileError(error) || isInvalidSnapshotError(error)) {
          return null;
        }

        throw error;
      }
    },
    async writeCheckpoint(snapshot: OrchestrationSnapshot): Promise<void> {
      await ensureOrchestrationDirectory();
      await writeFile(getCheckpointPath(), JSON.stringify(snapshot, null, 2), "utf8");
    },
    async recoverState(): Promise<RecoveredOrchestrationState> {
      const [snapshot, events] = await Promise.all([this.loadSnapshot(), this.loadEvents()]);
      return recoverOrchestrationState(snapshot, events);
    },
    async appendMailboxEvent(agentId: string, event: OrchestrationMailboxEvent): Promise<void> {
      await ensureSubAgentDirectory(agentId);
      await appendFile(getMailboxPath(agentId), `${JSON.stringify(event)}\n`, "utf8");
    },
    async loadMailboxEvents(agentId: string): Promise<OrchestrationMailboxEvent[]> {
      try {
        const contents = await readFile(getMailboxPath(agentId), "utf8");
        return contents
          .split("\n")
          .filter((line) => line.trim().length > 0)
          .map((line) => JSON.parse(line) as OrchestrationMailboxEvent);
      } catch (error) {
        if (isMissingFileError(error)) {
          return [];
        }

        throw error;
      }
    },
    async loadMailboxState(agentId: string): Promise<OrchestrationMailboxState> {
      try {
        const contents = await readFile(getMailboxStatePath(agentId), "utf8");
        return JSON.parse(contents) as OrchestrationMailboxState;
      } catch (error) {
        if (isMissingFileError(error) || isInvalidSnapshotError(error)) {
          return {
            processedEventCount: 0,
            closeRequested: null,
          };
        }

        throw error;
      }
    },
    async writeMailboxState(agentId: string, state: OrchestrationMailboxState): Promise<void> {
      await ensureSubAgentDirectory(agentId);
      await writeFile(getMailboxStatePath(agentId), JSON.stringify(state, null, 2), "utf8");
    },
    async loadAgentHistory(agentId: string): Promise<unknown[]> {
      try {
        const contents = await readFile(getHistoryPath(agentId), "utf8");
        return JSON.parse(contents) as unknown[];
      } catch {
        return [];
      }
    },
    async writeAgentHistory(agentId: string, history: unknown[]): Promise<void> {
      await ensureSubAgentDirectory(agentId);
      await writeFile(getHistoryPath(agentId), JSON.stringify(history, null, 2), "utf8");
    },
  };
}
