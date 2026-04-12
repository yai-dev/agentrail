/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { ToolPermissionPolicy } from "@/permissions/index.js";
import { evaluatePolicy, isPathSafe, workspaceAnchor } from "@/permissions/index.js";
import { tool } from "@agentrail/core";
import { Type } from "@sinclair/typebox";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const toolName = "Write";
const toolLabel = "Write";
const toolDescription = `Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- Prefer the Edit tool for modifying existing files — it only sends the diff. Only use this tool to create new files or for complete rewrites.
- NEVER create documentation files (*.md) or README files unless explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.`;

const parametersSchema = Type.Object({
  file_path: Type.String({
    description: "The absolute path of the file to write.",
  }),
  contents: Type.String({
    description: "The content to write to the file.",
  }),
});

/** Options for `createWriteTool`. */
export interface WriteToolOptions {
  /** When set, file paths must be anchored within this directory. */
  rootDir?: string;
  /** Active permission policy evaluated before writing. */
  policy?: ToolPermissionPolicy;
}

/**
 * Creates a non-sandboxed Write tool with optional path anchoring and
 * permission policy.
 */
export function createWriteTool(opts?: WriteToolOptions) {
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
        return evaluatePolicy(opts.policy, "Write", file_path);
      }
      return "allow";
    })
    .execute(async ({ file_path, contents }) => {
      try {
        await mkdir(dirname(file_path), { recursive: true });
        await writeFile(file_path, contents, "utf-8");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error writing file: ${message}` }],
          details: { error: message },
        };
      }

      return {
        content: [{ type: "text" as const, text: `Successfully wrote ${file_path}` }],
        details: { file_path },
      };
    })
    .build();
}

/** Non-sandboxed Write tool with no path restrictions (backward-compatible singleton). */
export const writeTool = createWriteTool();
