/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { MemoDocumentName, MemoDocumentScope } from "@agentrail/core";

/**
 * The canonical root that the agent sandbox sees for memo resources.
 * Paths below this root are the formal `/workspace/memo/**` contract.
 */
export const MEMO_FS_ROOT = "/workspace/memo" as const;

/**
 * A parsed representation of a `/workspace/memo/**` resource.
 *
 * - `document` — one of the three built-in memo documents (NOTES.md, TODO.md, USER.md)
 * - `tool-result` — a compacted tool-result artifact
 */
export type MemoResource =
  | {
      kind: "document";
      scope: MemoDocumentScope;
      name: MemoDocumentName;
    }
  | {
      kind: "tool-result";
      toolCallId: string;
    };

/** Returns `true` when `filePath` is inside `/workspace/memo/**`. */
export function isMemoPath(filePath: string): boolean {
  return filePath === MEMO_FS_ROOT || filePath.startsWith(MEMO_FS_ROOT + "/");
}

/**
 * Parse a `/workspace/memo/**` path into a typed `MemoResource`.
 * Throws when the path is not a valid memo path or names an unknown resource.
 *
 * @example
 * parseMemoPath("/workspace/memo/session/NOTES.md")
 * // → { kind: "document", scope: "session", name: "NOTES.md" }
 *
 * parseMemoPath("/workspace/memo/session/tool-results/abc123.txt")
 * // → { kind: "tool-result", toolCallId: "abc123" }
 */
export function parseMemoPath(filePath: string): MemoResource {
  if (!isMemoPath(filePath)) {
    throw new Error(`[memo-fs] Not a memo path: "${filePath}". Must start with "${MEMO_FS_ROOT}".`);
  }

  // Strip the root prefix and leading slash.
  const relative = filePath.slice(MEMO_FS_ROOT.length + 1); // e.g. "session/NOTES.md"
  const parts = relative.split("/");

  if (parts.length < 2) {
    throw new Error(`[memo-fs] Incomplete memo path: "${filePath}".`);
  }

  const [rawScope, ...rest] = parts as [string, ...string[]];

  if (rawScope === "session") {
    if (rest[0] === "tool-results" && rest.length === 2) {
      const toolCallId = rest[1]!.replace(/\.txt$/, "");
      return { kind: "tool-result", toolCallId };
    }
    const name = rest[0];
    if (name === "NOTES.md" || name === "TODO.md") {
      return { kind: "document", scope: "session", name };
    }
    throw new Error(`[memo-fs] Unknown session memo document: "${name}" in path "${filePath}".`);
  }

  if (rawScope === "user") {
    const name = rest[0];
    if (name === "USER.md") {
      return { kind: "document", scope: "user", name };
    }
    throw new Error(`[memo-fs] Unknown user memo document: "${name}" in path "${filePath}".`);
  }

  throw new Error(`[memo-fs] Unknown memo scope: "${rawScope}" in path "${filePath}".`);
}

/**
 * Compute the canonical `/workspace/memo/**` path for a memo document.
 *
 * @example
 * memoDocumentPath("session", "NOTES.md") // → "/workspace/memo/session/NOTES.md"
 * memoDocumentPath("user", "USER.md")     // → "/workspace/memo/user/USER.md"
 */
export function memoDocumentPath(scope: MemoDocumentScope, name: MemoDocumentName): string {
  return `${MEMO_FS_ROOT}/${scope}/${name}`;
}

/**
 * Compute the canonical `/workspace/memo/session/tool-results/{toolCallId}.txt` path.
 */
export function memoToolResultPath(toolCallId: string): string {
  return `${MEMO_FS_ROOT}/session/tool-results/${toolCallId}.txt`;
}
