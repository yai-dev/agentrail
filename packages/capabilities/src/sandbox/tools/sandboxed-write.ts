/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SandboxManager } from "@/sandbox/sandbox-manager.js";
import { tool } from "@agentrail/core";
import { Type } from "@sinclair/typebox";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const toolDescription = `Writes a file to the sandbox workspace.

Usage:
- file_path must be an absolute path inside the sandbox (e.g. /workspace/output.txt).
- This tool will overwrite the existing file if there is one at the provided path.
- Prefer the Edit tool for modifying existing files. Only use Write to create new files or do complete rewrites.
- Parent directories are created automatically if they don't exist.`;

const parametersSchema = Type.Object({
  file_path: Type.String({
    description: "Absolute path inside the sandbox (e.g. /workspace/report.md).",
  }),
  contents: Type.String({
    description: "The content to write to the file.",
  }),
});

/** Creates the in-sandbox file write tool. */
export function createSandboxedWrite(
  manager: SandboxManager,
  sessionId: string,
  tenantId: string,
  userId: string,
) {
  return tool()
    .name("Write")
    .label("Write")
    .description(toolDescription)
    .parameters(parametersSchema)
    .execute(async ({ file_path, contents }) => {
      await manager.ensureSandbox(sessionId, tenantId, userId);

      try {
        if (manager.isContainerOnlyPath(file_path)) {
          await manager.writeFileInContainer(sessionId, file_path, contents);
        } else {
          const hostPath = manager.translateToHostPath(sessionId, file_path);
          await mkdir(dirname(hostPath), { recursive: true });
          await writeFile(hostPath, contents, "utf-8");
        }
      } catch (err) {
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
