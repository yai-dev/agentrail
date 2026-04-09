/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import fg from "fast-glob";
import { tool } from "@agentrail/core";
import { Type } from "@sinclair/typebox";
import type { SandboxManager } from "@/sandbox/sandbox-manager.js";

const toolDescription = `Find files in the sandbox workspace by glob pattern.

Usage:
- Use this tool for filename and path discovery inside the sandbox.
- Prefer this over Bash for wildcard matching or file listing tasks.
- \`path\` defaults to /workspace and must stay inside the sandbox workspace.
- Results are returned relative to the search root.`;

const parametersSchema = Type.Object({
  pattern: Type.String({
    description: 'Glob pattern to match, for example "**/*.ts" or ".deep-research/**/*.md".',
  }),
  path: Type.Optional(
    Type.String({
      description: "Absolute sandbox path to search in. Defaults to /workspace.",
    }),
  ),
});

interface SandboxedGlobResultDetails {
  searchRoot: string;
  matches: string[];
}

/** Creates the in-sandbox glob tool for filename discovery. */
export function createSandboxedGlob(
  manager: SandboxManager,
  sessionId: string,
  tenantId: string,
  userId: string,
) {
  return tool()
    .name("Glob")
    .label("Glob")
    .description(toolDescription)
    .parameters(parametersSchema)
    .execute(async ({ pattern, path: requestedPath }) => {
      await manager.ensureSandbox(sessionId, tenantId, userId);

      const searchRootPath = requestedPath ?? "/workspace";

      let searchRoot: string;
      try {
        searchRoot = manager.translateToHostPath(sessionId, searchRootPath);
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: path '${searchRootPath}' is outside the sandbox workspace.`,
            },
          ],
          details: {
            searchRoot: searchRootPath,
            matches: [],
          } satisfies SandboxedGlobResultDetails,
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
          ? `Search root: ${searchRootPath}\n${matches.join("\n")}`
          : `(no matches)\nSearch root: ${searchRootPath}`;

      return {
        content: [{ type: "text" as const, text }],
        details: {
          searchRoot: searchRootPath,
          matches,
        } satisfies SandboxedGlobResultDetails,
      };
    })
    .build();
}
