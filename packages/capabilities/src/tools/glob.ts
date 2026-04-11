/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { tool } from "@agentrail/core";
import { Type } from "@sinclair/typebox";
import fg from "fast-glob";
import path from "node:path";

const toolDescription = `Find files by glob pattern.

Usage:
- Use this tool for filename and path discovery tasks.
- Prefer this over Bash for file listing or wildcard matching.
- Results are returned relative to the search root.
- The search root defaults to the current workspace root unless \`path\` is provided.`;

const parametersSchema = Type.Object({
  pattern: Type.String({
    description: 'Glob pattern to match, for example "**/*.ts" or "src/**/*.md".',
  }),
  path: Type.Optional(
    Type.String({
      description:
        "Optional subdirectory to search within. Must stay inside the configured root directory.",
    }),
  ),
});

interface GlobResultDetails {
  searchRoot: string;
  matches: string[];
}

function resolveSearchRoot(rootDir: string, requestedPath?: string): string {
  if (!requestedPath) {
    return rootDir;
  }

  const candidate = path.resolve(rootDir, requestedPath);
  const relative = path.relative(rootDir, candidate);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path '${requestedPath}' is outside the allowed root directory.`);
  }

  return candidate;
}

/** Creates a host-side glob tool anchored to a local root directory. */
export function createGlobTool(rootDir: string = process.cwd()) {
  const resolvedRootDir = path.resolve(rootDir);

  return tool()
    .name("Glob")
    .label("Glob")
    .description(toolDescription)
    .parameters(parametersSchema)
    .execute(async ({ pattern, path: requestedPath }) => {
      let searchRoot: string;

      try {
        searchRoot = resolveSearchRoot(resolvedRootDir, requestedPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: {
            searchRoot: resolvedRootDir,
            matches: [],
          } satisfies GlobResultDetails,
        };
      }

      const matches = (
        await fg(pattern, {
          cwd: searchRoot,
          onlyFiles: true,
          dot: true,
          unique: true,
          followSymbolicLinks: false,
        })
      ).sort((a, b) => a.localeCompare(b));

      const text =
        matches.length > 0
          ? `Search root: ${searchRoot}\n${matches.join("\n")}`
          : `(no matches)\nSearch root: ${searchRoot}`;

      return {
        content: [{ type: "text" as const, text }],
        details: {
          searchRoot,
          matches,
        } satisfies GlobResultDetails,
      };
    })
    .build();
}
