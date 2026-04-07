/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { tool } from "@agentrail/core";
import { Type } from "@sinclair/typebox";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SandboxManager } from "../sandbox-manager.js";

const runRg = promisify(execFile);

const toolDescription = `Searches for patterns in the sandbox workspace using ripgrep.

Usage:
- ALWAYS use this tool for search tasks. NEVER invoke rg or grep via the Bash tool.
- path defaults to /workspace (searches the entire sandbox workspace).
- Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+").
- Filter files with glob or type parameters.
- Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts.`;

const parametersSchema = Type.Object({
  pattern: Type.String({ description: "The regular expression pattern to search for." }),
  path: Type.Optional(
    Type.String({
      description:
        "Absolute sandbox path to search in (e.g. /workspace/src). Defaults to /workspace.",
    }),
  ),
  glob: Type.Optional(
    Type.String({ description: 'Glob pattern to filter files (e.g. "*.py", "**/*.{ts,tsx}").' }),
  ),
  type: Type.Optional(
    Type.String({ description: 'File type to search (e.g. "js", "py", "rust").' }),
  ),
  output_mode: Type.Optional(
    Type.Union(
      [Type.Literal("content"), Type.Literal("files_with_matches"), Type.Literal("count")],
      {
        description:
          '"content" shows lines, "files_with_matches" shows paths, "count" shows counts. Defaults to "files_with_matches".',
        default: "files_with_matches",
      },
    ),
  ),
  multiline: Type.Optional(
    Type.Boolean({ description: "Enable multiline mode. Default: false.", default: false }),
  ),
  case_insensitive: Type.Optional(
    Type.Boolean({ description: "Case insensitive search. Default: false.", default: false }),
  ),
});

/** Creates the in-sandbox grep tool for content search. */
export function createSandboxedGrep(
  manager: SandboxManager,
  sessionId: string,
  tenantId: string,
  userId: string,
) {
  return tool()
    .name("Grep")
    .label("Grep")
    .description(toolDescription)
    .parameters(parametersSchema)
    .execute(async ({ pattern, path, glob, type, output_mode, multiline, case_insensitive }) => {
      await manager.ensureSandbox(sessionId, tenantId, userId);

      const mode = output_mode ?? "files_with_matches";

      // Translate container path to host path for rg search
      let searchPath: string;
      if (path) {
        try {
          searchPath = manager.translateToHostPath(sessionId, path);
        } catch {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: path '${path}' is outside the sandbox workspace.`,
              },
            ],
            details: { error: "path outside sandbox" },
          };
        }
      } else {
        // Default: search entire workspace (translated to host path)
        searchPath = manager.translateToHostPath(sessionId, "/workspace");
      }

      const args: string[] = ["rg"];
      if (mode === "files_with_matches") args.push("-l");
      else if (mode === "count") args.push("--count");

      if (multiline) args.push("-U", "--multiline-dotall");
      if (case_insensitive) args.push("-i");
      if (glob) {
        args.push("--glob");
        args.push(glob);
      }
      if (type) {
        args.push("--type");
        args.push(type);
      }

      args.push("--", pattern, searchPath);

      try {
        const { stdout } = await runRg(args[0]!, args.slice(1), { maxBuffer: 10 * 1024 * 1024 });
        const text = stdout.trim() || "(no matches)";
        return {
          content: [{ type: "text" as const, text }],
          details: { matches: stdout.trim().split("\n").filter(Boolean) },
        };
      } catch (err: unknown) {
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code: unknown }).code === 1
        ) {
          return {
            content: [{ type: "text" as const, text: "(no matches)" }],
            details: { matches: [] },
          };
        }
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { error: message },
        };
      }
    })
    .build();
}
