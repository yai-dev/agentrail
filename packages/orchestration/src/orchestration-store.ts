/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  recoverOrchestrationState,
  type RecoveredOrchestrationState,
} from "./recovery.js";
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

function getOrchestrationDirectory(sessionDir: string): string {
  return join(sessionDir, ORCHESTRATION_DIRECTORY);
}

function getEventsPath(sessionDir: string): string {
  return join(getOrchestrationDirectory(sessionDir), EVENTS_FILE);
}

function getCheckpointPath(sessionDir: string): string {
  return join(getOrchestrationDirectory(sessionDir), CHECKPOINT_FILE);
}

function getSubAgentDirectory(sessionDir: string, agentId: string): string {
  return join(getOrchestrationDirectory(sessionDir), SUBAGENTS_DIRECTORY, agentId);
}

function getMailboxPath(sessionDir: string, agentId: string): string {
  return join(getSubAgentDirectory(sessionDir, agentId), MAILBOX_FILE);
}

function getMailboxStatePath(sessionDir: string, agentId: string): string {
  return join(getSubAgentDirectory(sessionDir, agentId), MAILBOX_STATE_FILE);
}

async function ensureOrchestrationDirectory(sessionDir: string): Promise<void> {
  await mkdir(getOrchestrationDirectory(sessionDir), { recursive: true });
}

async function ensureSubAgentDirectory(
  sessionDir: string,
  agentId: string,
): Promise<void> {
  await mkdir(getSubAgentDirectory(sessionDir, agentId), { recursive: true });
}

export async function appendEvent(
  sessionDir: string,
  event: OrchestrationEvent,
): Promise<void> {
  await ensureOrchestrationDirectory(sessionDir);
  await appendFile(getEventsPath(sessionDir), `${JSON.stringify(event)}\n`, "utf8");
}

export async function loadEvents(
  sessionDir: string,
): Promise<OrchestrationEvent[]> {
  try {
    const contents = await readFile(getEventsPath(sessionDir), "utf8");
    return contents
      .split("\n")
      .filter((line: string) => line.trim().length > 0)
      .map((line: string) => JSON.parse(line) as OrchestrationEvent);
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}

export async function loadSnapshot(
  sessionDir: string,
): Promise<OrchestrationSnapshot | null> {
  try {
    const contents = await readFile(getCheckpointPath(sessionDir), "utf8");
    return JSON.parse(contents) as OrchestrationSnapshot;
  } catch (error) {
    if (isMissingFileError(error) || isInvalidSnapshotError(error)) {
      return null;
    }

    throw error;
  }
}

export async function writeCheckpoint(
  sessionDir: string,
  snapshot: OrchestrationSnapshot,
): Promise<void> {
  await ensureOrchestrationDirectory(sessionDir);
  await writeFile(
    getCheckpointPath(sessionDir),
    JSON.stringify(snapshot, null, 2),
    "utf8",
  );
}

export async function recoverState(
  sessionDir: string,
): Promise<RecoveredOrchestrationState> {
  const [snapshot, events] = await Promise.all([
    loadSnapshot(sessionDir),
    loadEvents(sessionDir),
  ]);

  return recoverOrchestrationState(snapshot, events);
}

export async function appendMailboxEvent(
  sessionDir: string,
  agentId: string,
  event: OrchestrationMailboxEvent,
): Promise<void> {
  await ensureSubAgentDirectory(sessionDir, agentId);
  await appendFile(getMailboxPath(sessionDir, agentId), `${JSON.stringify(event)}\n`, "utf8");
}

export async function loadMailboxEvents(
  sessionDir: string,
  agentId: string,
): Promise<OrchestrationMailboxEvent[]> {
  try {
    const contents = await readFile(getMailboxPath(sessionDir, agentId), "utf8");
    return contents
      .split("\n")
      .filter((line: string) => line.trim().length > 0)
      .map((line: string) => JSON.parse(line) as OrchestrationMailboxEvent);
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}

export async function loadMailboxState(
  sessionDir: string,
  agentId: string,
): Promise<OrchestrationMailboxState> {
  try {
    const contents = await readFile(getMailboxStatePath(sessionDir, agentId), "utf8");
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
}

export async function writeMailboxState(
  sessionDir: string,
  agentId: string,
  state: OrchestrationMailboxState,
): Promise<void> {
  await ensureSubAgentDirectory(sessionDir, agentId);
  await writeFile(
    getMailboxStatePath(sessionDir, agentId),
    JSON.stringify(state, null, 2),
    "utf8",
  );
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

export const OrchestrationStore = {
  appendEvent,
  appendMailboxEvent,
  loadEvents,
  loadMailboxEvents,
  loadMailboxState,
  loadSnapshot,
  writeCheckpoint,
  writeMailboxState,
  recoverState,
};
