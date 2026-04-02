/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { tool } from "@agentrail/runtime-core";
import { Type } from "@sinclair/typebox";

const execAsync = promisify(exec);

const toolName = "Grep";
const BASH_TOOL_NAME = "Bash";
const toolLabel = "Grep";
const toolDescription = `A powerful search tool built on ripgrep.

Usage:
  - ALWAYS use ${toolName} for search tasks. NEVER invoke \`grep\` or \`rg\` as a ${BASH_TOOL_NAME} command. The ${toolName} tool has been optimized for correct permissions and access.
  - Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
  - Filter files with glob parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust")
  - Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts
  - Pattern syntax: Uses ripgrep (not grep) - literal braces need escaping (use \`interface\\{\\}\` to find \`interface{}\` in Go code)
  - Multiline matching: By default patterns match within single lines only. For cross-line patterns like \`struct \\{[\\s\\S]*?field\`, use \`multiline: true
`;

const parametersSchema = Type.Object({
  pattern: Type.String({
    description: "The regular expression pattern to search for.",
  }),
  path: Type.Optional(
    Type.String({
      description: "File or directory path to search in. Defaults to current working directory.",
    }),
  ),
  glob: Type.Optional(
    Type.String({
      description: 'Glob pattern to filter files (e.g. "*.js", "**/*.{ts,tsx}").',
    }),
  ),
  type: Type.Optional(
    Type.String({
      description:
        'File type to search (e.g. "js", "py", "rust", "ts"). More efficient than glob for standard file types.',
    }),
  ),
  output_mode: Type.Optional(
    Type.Union(
      [Type.Literal("content"), Type.Literal("files_with_matches"), Type.Literal("count")],
      {
        description:
          '"content" shows matching lines, "files_with_matches" shows only file paths, "count" shows match counts. Defaults to "files_with_matches".',
        default: "files_with_matches",
      },
    ),
  ),
  multiline: Type.Optional(
    Type.Boolean({
      description: "Enable multiline mode where patterns can span lines. Default: false.",
      default: false,
    }),
  ),
  case_insensitive: Type.Optional(
    Type.Boolean({
      description: "Case insensitive search. Default: false.",
      default: false,
    }),
  ),
});

export const grepTool = tool()
  .name(toolName)
  .label(toolLabel)
  .description(toolDescription)
  .parameters(parametersSchema)
  .execute(async ({ pattern, path, glob, type, output_mode, multiline, case_insensitive }) => {
    const mode = output_mode ?? "files_with_matches";

    const args: string[] = ["rg"];

    if (mode === "files_with_matches") args.push("-l");
    else if (mode === "count") args.push("--count");

    if (multiline) args.push("-U", "--multiline-dotall");
    if (case_insensitive) args.push("-i");
    if (glob) args.push("--glob", glob);
    if (type) args.push("--type", type);

    args.push("--", pattern);
    if (path) args.push(path);

    const cmd = args
      .map((a) => (a.startsWith("-") ? a : `'${a.replace(/'/g, "'\\''")}'`))
      .join(" ");

    try {
      const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
      const text = stdout.trim() || "(no matches)";
      return {
        content: [{ type: "text" as const, text }],
        details: { matches: stdout.trim().split("\n").filter(Boolean) },
      };
    } catch (err: unknown) {
      // rg exits with code 1 when no matches found (not an error)
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as NodeJS.ErrnoException).code === "1"
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
