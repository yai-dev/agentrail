/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { readFile, writeFile } from "node:fs/promises";
import { tool } from "@agentrail/runtime-core";
import { Type } from "@sinclair/typebox";
import type { SandboxManager } from "../sandbox-manager.js";

const toolDescription = `Performs exact string replacements in files inside the sandbox workspace.

Usage:
- file_path must be an absolute path inside the sandbox (e.g. /workspace/script.py).
- You must first read the file using the Read tool before editing it.
- The edit will FAIL if old_string is not unique in the file. Provide more context or use replace_all.
- Use replace_all to rename all occurrences of a string across the file.`;

const parametersSchema = Type.Object({
  file_path: Type.String({
    description: "Absolute path inside the sandbox to the file to modify.",
  }),
  old_string: Type.String({
    description: "The text to replace. Must match exactly, including all whitespace and indentation.",
  }),
  new_string: Type.String({
    description: "The text to replace it with.",
  }),
  replace_all: Type.Optional(
    Type.Boolean({
      description: "If true, replaces all occurrences. Defaults to false (first occurrence only).",
      default: false,
    }),
  ),
});

export function createSandboxedEdit(
  manager: SandboxManager,
  sessionId: string,
  tenantId: string,
  userId: string,
) {
  return tool()
    .name("Edit")
    .label("Edit")
    .description(toolDescription)
    .parameters(parametersSchema)
    .execute(async ({ file_path, old_string, new_string, replace_all }) => {
      await manager.ensureSandbox(sessionId, tenantId, userId);

      const containerOnly = manager.isContainerOnlyPath(file_path);

      let content: string;
      try {
        if (containerOnly) {
          content = await manager.readFileInContainer(sessionId, file_path);
        } else {
          const hostPath = manager.translateToHostPath(sessionId, file_path);
          content = await readFile(hostPath, "utf-8");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error reading file: ${message}` }],
          details: { error: message },
        };
      }

      const occurrences = content.split(old_string).length - 1;

      if (occurrences === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: old_string not found in file. The string must match exactly, including whitespace and indentation.",
            },
          ],
          details: { error: "old_string not found", occurrences: 0 },
        };
      }

      if (!replace_all && occurrences > 1) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: old_string is not unique (found ${occurrences} occurrences). Provide more surrounding context or set replace_all to true.`,
            },
          ],
          details: { error: "old_string not unique", occurrences },
        };
      }

      const updated = replace_all
        ? content.split(old_string).join(new_string)
        : content.replace(old_string, new_string);

      try {
        if (containerOnly) {
          await manager.writeFileInContainer(sessionId, file_path, updated);
        } else {
          const hostPath = manager.translateToHostPath(sessionId, file_path);
          await writeFile(hostPath, updated, "utf-8");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error writing file: ${message}` }],
          details: { error: message },
        };
      }

      const replacedCount = replace_all ? occurrences : 1;
      return {
        content: [
          {
            type: "text" as const,
            text: `Successfully replaced ${replacedCount} occurrence(s) in ${file_path}`,
          },
        ],
        details: { replacedCount },
      };
    })
    .build();
}
