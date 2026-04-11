/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SessionRef } from "@agentrail/core";
import { resolveSessionRef } from "@agentrail/core";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

/** Session-scoped persistence for workflow trace envelopes. */
export interface SessionTraceStore<TEnvelope = Record<string, unknown>> {
  appendEnvelope(envelope: TEnvelope): Promise<void>;
  loadEnvelopes(): Promise<TEnvelope[]>;
}

function getTraceDir(dataDir: string, sessionRef: SessionRef): string {
  const { tenantId, sessionId } = resolveSessionRef(sessionRef);
  return path.join(dataDir, "tenants", tenantId, "sessions", sessionId, "trace");
}

// Module-level state shared across all instances writing to the same file.
// Ensures serialized writes and a one-time mkdir per file path regardless of
// how many store instances are created (e.g. one per event in playground-server).
const writeQueues = new Map<string, Promise<void>>();
const dirEnsuredPaths = new Set<string>();

/**
 * Creates the default filesystem-backed trace store for a session.
 * The underlying trace file layout remains an internal detail of the memo package.
 */
export function createFileSystemSessionTraceStore<TEnvelope = Record<string, unknown>>(
  dataDir: string,
  sessionRef: SessionRef,
): SessionTraceStore<TEnvelope> {
  const traceDir = getTraceDir(dataDir, sessionRef);
  const traceFilePath = path.join(traceDir, "events.jsonl");

  return {
    appendEnvelope(envelope: TEnvelope): Promise<void> {
      const prev = writeQueues.get(traceFilePath) ?? Promise.resolve();
      const next = prev
        .then(async () => {
          if (!dirEnsuredPaths.has(traceFilePath)) {
            await mkdir(traceDir, { recursive: true });
            dirEnsuredPaths.add(traceFilePath);
          }
          await appendFile(traceFilePath, `${JSON.stringify(envelope)}\n`, "utf8");
        })
        .catch(() => {})
        .finally(() => {
          if (writeQueues.get(traceFilePath) === next) {
            writeQueues.delete(traceFilePath);
          }
        });
      writeQueues.set(traceFilePath, next);
      return next;
    },
    async loadEnvelopes(): Promise<TEnvelope[]> {
      try {
        const contents = await readFile(traceFilePath, "utf8");
        return contents
          .split("\n")
          .filter((line) => line.trim().length > 0)
          .map((line) => JSON.parse(line) as TEnvelope);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return [];
        }

        throw error;
      }
    },
  };
}
