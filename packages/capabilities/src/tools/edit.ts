/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { ToolPermissionPolicy } from "@/permissions/index.js";
import { evaluatePolicy, isPathSafe, workspaceAnchor } from "@/permissions/index.js";
import { tool } from "@agentrail/core";
import { Type } from "@sinclair/typebox";
import { readFile, writeFile } from "node:fs/promises";

const toolName = "Edit";
const toolLabel = "Edit";
const toolDescription = `This tool for performing exact string replacements in files.

Usage:
- You must first read the file using the Read tool before editing it.
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: spaces + line number + tab. Everything after that tab is the actual file content to match. Never include any part of the line number prefix in the old_string or new_string.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if \`old_string\` is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use \`replace_all\` to change every instance of \`old_string\`.
- Use \`replace_all\` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.
`;

const parametersSchema = Type.Object({
  file_path: Type.String({
    description: "The absolute path to the file to modify.",
  }),
  old_string: Type.String({
    description:
      "The text to replace. Must match the file content exactly, including all whitespace and indentation.",
  }),
  new_string: Type.String({
    description: "The text to replace it with.",
  }),
  replace_all: Type.Optional(
    Type.Boolean({
      description:
        "If true, replaces all occurrences of old_string. Defaults to false (replaces only the first occurrence).",
      default: false,
    }),
  ),
});

/** Options for `createEditTool`. */
export interface EditToolOptions {
  /** When set, file paths must be anchored within this directory. */
  rootDir?: string;
  /** Active permission policy evaluated before editing. */
  policy?: ToolPermissionPolicy;
}

/**
 * Creates a non-sandboxed Edit tool with optional path anchoring and
 * permission policy.
 */
export function createEditTool(opts?: EditToolOptions) {
  return tool()
    .name(toolName)
    .label(toolLabel)
    .description(toolDescription)
    .parameters(parametersSchema)
    .checkPermissions(({ file_path }) => {
      if (!isPathSafe(file_path)) {
        return { decision: "deny" as const, reason: `Path "${file_path}" is not allowed` };
      }
      if (opts?.rootDir) {
        try {
          workspaceAnchor(file_path, opts.rootDir);
        } catch (err) {
          return {
            decision: "deny" as const,
            reason: err instanceof Error ? err.message : String(err),
          };
        }
      }
      if (opts?.policy) {
        return evaluatePolicy(opts.policy, "Edit", file_path);
      }
      return "allow";
    })
    .execute(async ({ file_path, old_string, new_string, replace_all }) => {
      let content: string;
      try {
        content = await readFile(file_path, "utf-8");
      } catch (err: unknown) {
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
              text: `Error: old_string not found in file. The string must match exactly, including whitespace and indentation.`,
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
              text: `Error: old_string is not unique in the file (found ${occurrences} occurrences). Provide more surrounding context to make it unique, or set replace_all to true.`,
            },
          ],
          details: { error: "old_string not unique", occurrences },
        };
      }

      const updated = replace_all
        ? content.split(old_string).join(new_string)
        : content.replace(old_string, new_string);

      try {
        await writeFile(file_path, updated, "utf-8");
      } catch (err: unknown) {
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

/** Non-sandboxed Edit tool with no path restrictions (backward-compatible singleton). */
export const editTool = createEditTool();
