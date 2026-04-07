/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { tool } from "@agentrail/core";
import { Type } from "@sinclair/typebox";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SandboxManager } from "../sandbox-manager.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const TMP_DIR = "/workspace/.deep-research/tmp";
const ARTIFACT_DIR = "/workspace/.deep-research/artifacts";

const toolDescription = `Executes Python code inside the sandbox for structured research processing.

Usage:
- Use this tool for statistics, comparisons, tabular cleanup, transformations, and chart generation.
- Save generated files under /workspace/.deep-research/artifacts/.
- Only rely on preinstalled packages from the sandbox image.
- working_directory must stay inside /workspace.
- expected_output_files is optional but recommended when you know which files should be created.`;

const parametersSchema = Type.Object({
  code: Type.String({
    description: "Python code to execute. Print important results with print(...).",
  }),
  working_directory: Type.Optional(
    Type.String({
      description: "Sandbox working directory. Must start with /workspace. Defaults to /workspace.",
    }),
  ),
  timeout: Type.Optional(
    Type.Integer({
      minimum: 1,
      default: DEFAULT_TIMEOUT_MS,
      description: `Maximum execution time in milliseconds. Defaults to ${DEFAULT_TIMEOUT_MS}.`,
    }),
  ),
  expected_output_files: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Optional absolute sandbox file paths expected to be created or updated, typically under /workspace/.deep-research/artifacts/.",
    }),
  ),
});

interface PythonDetails {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  scriptPath: string;
  outputFiles: string[];
}

interface FileSnapshot {
  sandboxPath: string;
  mtimeMs: number;
}

function ensureWorkspacePath(containerPath: string, fieldName: string): void {
  if (!containerPath.startsWith("/workspace")) {
    throw new Error(`${fieldName} must start with /workspace`);
  }
}

async function collectArtifactSnapshots(
  hostRoot: string,
  sandboxRoot: string,
): Promise<FileSnapshot[]> {
  const snapshots: FileSnapshot[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      const fileStat = await stat(fullPath).catch(() => null);
      if (!fileStat?.isFile()) {
        continue;
      }

      const rel = path.relative(hostRoot, fullPath).replace(/\\/g, "/");
      snapshots.push({
        sandboxPath: `${sandboxRoot}/${rel}`,
        mtimeMs: fileStat.mtimeMs,
      });
    }
  }

  await walk(hostRoot);
  return snapshots;
}

/** Creates the Python execution tool that runs scripts inside the sandbox. */
export function createSandboxedPython(
  manager: SandboxManager,
  sessionId: string,
  tenantId: string,
  userId: string,
) {
  return tool()
    .name("Python")
    .label("Python")
    .description(toolDescription)
    .parameters(parametersSchema)
    .execute(async ({ code, working_directory, timeout, expected_output_files }) => {
      await manager.ensureSandbox(sessionId, tenantId, userId);

      const workDir = working_directory ?? "/workspace";
      ensureWorkspacePath(workDir, "working_directory");
      for (const outputPath of expected_output_files ?? []) {
        ensureWorkspacePath(outputPath, "expected_output_files");
      }

      const hostTmpDir = manager.translateToHostPath(sessionId, TMP_DIR);
      const hostArtifactDir = manager.translateToHostPath(sessionId, ARTIFACT_DIR);
      await mkdir(hostTmpDir, { recursive: true });
      await mkdir(hostArtifactDir, { recursive: true });

      const startedAt = Date.now();
      const scriptName = `run-${startedAt}-${Math.random().toString(36).slice(2, 8)}.py`;
      const hostScriptPath = path.join(hostTmpDir, scriptName);
      const sandboxScriptPath = `${TMP_DIR}/${scriptName}`;
      await writeFile(hostScriptPath, code, "utf-8");

      const beforeSnapshots = await collectArtifactSnapshots(hostArtifactDir, ARTIFACT_DIR);
      const beforeMap = new Map(beforeSnapshots.map((item) => [item.sandboxPath, item.mtimeMs]));

      const result = await manager.runInSandbox(sessionId, ["python3", sandboxScriptPath], {
        timeout: timeout ?? DEFAULT_TIMEOUT_MS,
        workingDir: workDir,
      });

      const afterSnapshots = await collectArtifactSnapshots(hostArtifactDir, ARTIFACT_DIR);
      const changedArtifacts = afterSnapshots
        .filter(
          (item) =>
            (beforeMap.get(item.sandboxPath) ?? -1) < item.mtimeMs && item.mtimeMs >= startedAt,
        )
        .map((item) => item.sandboxPath);

      const outputFiles = [...new Set([...changedArtifacts, ...(expected_output_files ?? [])])];
      const stdout = result.stdout.trim();
      const stderr = result.stderr.trim();
      const parts: string[] = [];

      if (stdout) parts.push(stdout);
      if (stderr) parts.push(`[stderr]\n${stderr}`);
      if (!stdout && !stderr) parts.push("(no output)");
      parts.push(`\n[exit code: ${result.exitCode}]`);
      if (result.timedOut) {
        parts.push("[timed out]");
      }
      if (outputFiles.length > 0) {
        parts.push(`Generated files:\n${outputFiles.map((item) => `- ${item}`).join("\n")}`);
      }

      return {
        content: [{ type: "text" as const, text: parts.join("\n") }],
        details: {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          timedOut: result.timedOut,
          scriptPath: sandboxScriptPath,
          outputFiles,
        } satisfies PythonDetails,
      };
    })
    .build();
}
