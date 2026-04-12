/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { ToolPermissionPolicy } from "@/permissions/index.js";
import { evaluatePolicy, normalizeBashCommand } from "@/permissions/index.js";
import type { SandboxManager } from "@/sandbox/sandbox-manager.js";
import { tool } from "@agentrail/core";
import { Type } from "@sinclair/typebox";

const DEFAULT_TIMEOUT_MS = 30_000;

const toolDescription = `Executes a shell command inside the isolated sandbox workspace and returns its output.

Usage:
- Commands that finish within \`timeout\` ms are returned in full (foreground mode).
- Commands still running when \`timeout\` elapses are moved to background; the tool returns the partial output collected so far. The process continues running inside the sandbox.
- Set \`timeout\` to 0 to immediately background a command (e.g. dev servers, watchers).
- The \`working_directory\` sets the cwd inside the sandbox (must start with /workspace). Defaults to /workspace.
- stdout and stderr are both captured; combined output is truncated at 1 MB.
- Non-zero exit codes are not treated as tool errors — check \`exit_code\` in the result.
- Do NOT use this tool for file search — use the Grep tool instead.
- Do NOT use this tool for file read/write — use the Read, Write, or Edit tools instead.
- All file paths inside the sandbox start with /workspace.
- Session memory files (NOTES.md, TODO.md) are at /workspace/memo/session/.
- User profile (USER.md) is at /workspace/memo/user/USER.md.`;

const parametersSchema = Type.Object({
  command: Type.String({ description: "The shell command to execute inside the sandbox." }),
  working_directory: Type.Optional(
    Type.String({
      description:
        "Absolute path inside the sandbox (e.g. /workspace/myproject). Defaults to /workspace.",
    }),
  ),
  timeout: Type.Optional(
    Type.Integer({
      description: `Milliseconds to wait before moving to background. Defaults to ${DEFAULT_TIMEOUT_MS}. Set to 0 to immediately background.`,
      minimum: 0,
      default: DEFAULT_TIMEOUT_MS,
    }),
  ),
});

type BashDetails =
  | { mode: "foreground"; exit_code: number; stdout: string; stderr: string }
  | { mode: "background"; stdout: string; stderr: string };

/** Creates the shell execution tool that runs commands inside the session sandbox. */
export function createSandboxedBash(
  manager: SandboxManager,
  sessionId: string,
  tenantId: string,
  userId: string,
  policy?: ToolPermissionPolicy,
) {
  return tool()
    .name("Bash")
    .label("Bash")
    .description(toolDescription)
    .parameters(parametersSchema)
    .checkPermissions(({ command }) => {
      if (policy) {
        return evaluatePolicy(policy, "Bash", normalizeBashCommand(command));
      }
      return "allow";
    })
    .execute(async ({ command, working_directory, timeout }, { signal }) => {
      await manager.ensureSandbox(sessionId, tenantId, userId);

      const timeoutMs = timeout ?? DEFAULT_TIMEOUT_MS;
      const workDir = working_directory ?? "/workspace";

      const result = await manager.runBackgroundShellCommand(sessionId, command, {
        timeout: timeoutMs,
        workingDir: workDir,
        signal,
      });

      let text: string;
      let details: BashDetails;

      if (!result.timedOut) {
        const parts: string[] = [];
        if (result.stdout) parts.push(result.stdout);
        if (result.stderr) parts.push(`[stderr]\n${result.stderr}`);
        if (parts.length === 0) parts.push("(no output)");
        parts.push(`\n[exit code: ${result.exitCode ?? 0}]`);
        text = parts.join("\n");
        details = {
          mode: "foreground",
          exit_code: result.exitCode ?? 0,
          stdout: result.stdout,
          stderr: result.stderr,
        };
      } else {
        const parts: string[] = ["Process moved to background (still running in sandbox)"];
        if (result.stdout) parts.push(result.stdout);
        if (result.stderr) parts.push(`[stderr]\n${result.stderr}`);
        text = parts.join("\n");
        details = { mode: "background", stdout: result.stdout, stderr: result.stderr };
      }

      return {
        content: [{ type: "text" as const, text }],
        details,
      };
    })
    .build();
}
