/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { readFile } from "node:fs/promises";
import { tool } from "@agentrail/runtime-core";
import { Type } from "@sinclair/typebox";
import type { SandboxManager } from "../sandbox-manager.js";

const DEFAULT_READ_LINES = 100;
const MAX_LINE_LENGTH = 1000;

const toolDescription = `Reads a file from the sandbox workspace.

Usage:
- file_path must be an absolute path inside the sandbox (e.g. /workspace/myfile.txt).
- Session memory files are at /workspace/memo/session/ (NOTES.md, TODO.md).
- User profile is at /workspace/memo/user/USER.md.
- By default reads up to ${DEFAULT_READ_LINES} lines from the beginning.
- Optionally specify offset and limit for large files.
- Lines longer than ${MAX_LINE_LENGTH} characters will be truncated.`;

const parametersSchema = Type.Object({
  file_path: Type.String({
    description: "Absolute path inside the sandbox (e.g. /workspace/report.py, /workspace/memo/session/NOTES.md).",
  }),
  offset: Type.Optional(
    Type.Integer({
      description: "Line number to start from (1-indexed). Negative counts from end (e.g. -1 is last line).",
    }),
  ),
  limit: Type.Optional(
    Type.Integer({
      description: `Max lines to read. Defaults to ${DEFAULT_READ_LINES}.`,
      minimum: 1,
    }),
  ),
});

export function createSandboxedRead(
  manager: SandboxManager,
  sessionId: string,
  tenantId: string,
  userId: string,
) {
  return tool()
    .name("Read")
    .label("Read")
    .description(toolDescription)
    .parameters(parametersSchema)
    .execute(async ({ file_path, offset, limit }) => {
      await manager.ensureSandbox(sessionId, tenantId, userId);

      let raw: string;
      try {
        if (manager.isContainerOnlyPath(file_path)) {
          raw = await manager.readFileInContainer(sessionId, file_path);
        } else {
          const hostPath = manager.translateToHostPath(sessionId, file_path);
          raw = await readFile(hostPath, "utf-8");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error reading file: ${message}` }],
          details: { error: message },
        };
      }

      const allLines = raw.split("\n");
      const totalLines = allLines.length;

      if (raw === "") {
        return {
          content: [
            {
              type: "text" as const,
              text: "<system-reminder>File exists but has empty contents.</system-reminder>",
            },
          ],
          details: { totalLines: 0, lines: [] },
        };
      }

      const maxLines = limit ?? DEFAULT_READ_LINES;

      let startIndex: number;
      if (offset === undefined || offset === null) {
        startIndex = 0;
      } else if (offset < 0) {
        startIndex = Math.max(0, totalLines + offset);
      } else {
        startIndex = Math.max(0, offset - 1);
      }

      const selectedLines = allLines.slice(startIndex, startIndex + maxLines);

      const formattedLines = selectedLines.map((line, i) => {
        const lineNum = startIndex + i + 1;
        const truncated =
          line.length > MAX_LINE_LENGTH
            ? line.slice(0, MAX_LINE_LENGTH) + " [truncated]"
            : line;
        return `${String(lineNum).padStart(6)}|${truncated}`;
      });

      return {
        content: [{ type: "text" as const, text: formattedLines.join("\n") }],
        details: {
          totalLines,
          startLine: startIndex + 1,
          endLine: startIndex + selectedLines.length,
          lines: selectedLines,
        },
      };
    })
    .build();
}
