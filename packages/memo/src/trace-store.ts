/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { SessionRef } from "./session-ref.js";
import { resolveSessionRef } from "./session-ref.js";

/** Session-scoped persistence for workflow trace envelopes. */
export interface SessionTraceStore<TEnvelope = Record<string, unknown>> {
  appendEnvelope(envelope: TEnvelope): Promise<void>;
  loadEnvelopes(): Promise<TEnvelope[]>;
}

function getTraceDir(dataDir: string, sessionRef: SessionRef): string {
  const { tenantId, sessionId } = resolveSessionRef(sessionRef);
  return path.join(dataDir, "tenants", tenantId, "sessions", sessionId, "trace");
}

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
    async appendEnvelope(envelope: TEnvelope): Promise<void> {
      await mkdir(traceDir, { recursive: true });
      await appendFile(traceFilePath, `${JSON.stringify(envelope)}\n`, "utf8");
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
