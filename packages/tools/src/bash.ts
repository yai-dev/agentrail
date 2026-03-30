/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { spawn } from "node:child_process";
import { tool } from "@agentrail/runtime-core";
import { Type } from "@sinclair/typebox";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MB

const toolName = "Bash";
const toolLabel = "Bash";
const toolDescription = `Executes a shell command and returns its output.

Usage:
- Commands that finish within \`timeout\` ms are returned in full (foreground mode).
- Commands still running when \`timeout\` elapses are detached and continue in the background; the tool returns the partial output collected so far and the background process PID.
- Set \`timeout\` to 0 to immediately background a command (e.g. dev servers, watchers).
- The \`working_directory\` parameter sets the cwd for the command; defaults to the current working directory.
- Non-zero exit codes are not treated as tool errors — check \`exit_code\` in the result.
- stdout and stderr are both captured; combined output is truncated at 1 MB.
- Do NOT use this tool for file search tasks — use the Grep tool instead.
- Do NOT use this tool for file read/write — use the ReadFile, Edit, or Write tools instead.
`;

const parametersSchema = Type.Object({
    command: Type.String({
        description: "The shell command to execute.",
    }),
    working_directory: Type.Optional(
        Type.String({
            description: "Absolute path to the working directory. Defaults to the current working directory of the agent process.",
        }),
    ),
    timeout: Type.Optional(
        Type.Integer({
            description: `Milliseconds to wait before moving the process to background. Defaults to ${DEFAULT_TIMEOUT_MS}. Set to 0 to immediately background.`,
            minimum: 0,
            default: DEFAULT_TIMEOUT_MS,
        }),
    ),
});

type BashDetails =
    | { mode: "foreground"; exit_code: number; stdout: string; stderr: string }
    | { mode: "background"; pid: number; stdout: string; stderr: string };

function truncate(s: string, max: number): string {
    if (Buffer.byteLength(s, "utf-8") <= max) return s;
    const truncated = Buffer.from(s, "utf-8").subarray(0, max).toString("utf-8");
    return truncated + "\n[output truncated]";
}

export const bashTool = tool()
    .name(toolName)
    .label(toolLabel)
    .description(toolDescription)
    .parameters(parametersSchema)
    .execute(async ({ command, working_directory, timeout }, { signal }) => {
        const timeoutMs = timeout ?? DEFAULT_TIMEOUT_MS;
        const cwd = working_directory ?? process.cwd();

        let stdoutBuf = "";
        let stderrBuf = "";

        const child = spawn("/bin/sh", ["-c", command], {
            cwd,
            env: process.env,
            // detached so the process can survive beyond the parent wait
            detached: true,
            stdio: ["ignore", "pipe", "pipe"],
        });

        const pid = child.pid!;

        child.stdout.on("data", (chunk: Buffer) => {
            stdoutBuf += chunk.toString("utf-8");
        });
        child.stderr.on("data", (chunk: Buffer) => {
            stderrBuf += chunk.toString("utf-8");
        });

        // Abort support: kill child if the agent is aborted
        const onAbort = () => {
            try { child.kill(); } catch { /* ignore */ }
        };
        signal?.addEventListener("abort", onAbort, { once: true });

        const result = await new Promise<BashDetails>((resolve) => {
            let settled = false;
            let timer: ReturnType<typeof setTimeout> | null = null;

            const settle = (details: BashDetails) => {
                if (settled) return;
                settled = true;
                if (timer !== null) clearTimeout(timer);
                signal?.removeEventListener("abort", onAbort);
                resolve(details);
            };

            child.on("close", (code) => {
                settle({
                    mode: "foreground",
                    exit_code: code ?? 0,
                    stdout: truncate(stdoutBuf, MAX_OUTPUT_BYTES),
                    stderr: truncate(stderrBuf, MAX_OUTPUT_BYTES),
                });
            });

            child.on("error", (err) => {
                settle({
                    mode: "foreground",
                    exit_code: 1,
                    stdout: "",
                    stderr: err.message,
                });
            });

            if (timeoutMs === 0) {
                // Immediately background
                child.unref();
                settle({
                    mode: "background",
                    pid,
                    stdout: "",
                    stderr: "",
                });
            } else {
                timer = setTimeout(() => {
                    // Detach from the Node event loop; process keeps running
                    child.unref();
                    settle({
                        mode: "background",
                        pid,
                        stdout: truncate(stdoutBuf, MAX_OUTPUT_BYTES),
                        stderr: truncate(stderrBuf, MAX_OUTPUT_BYTES),
                    });
                }, timeoutMs);
            }
        });

        let text: string;
        if (result.mode === "foreground") {
            const parts: string[] = [];
            if (result.stdout) parts.push(result.stdout);
            if (result.stderr) parts.push(`[stderr]\n${result.stderr}`);
            if (parts.length === 0) parts.push("(no output)");
            parts.push(`\n[exit code: ${result.exit_code}]`);
            text = parts.join("\n");
        } else {
            const parts: string[] = [`Process is running in background (pid: ${result.pid})`];
            if (result.stdout) parts.push(result.stdout);
            if (result.stderr) parts.push(`[stderr]\n${result.stderr}`);
            text = parts.join("\n");
        }

        return {
            content: [{ type: "text" as const, text }],
            details: result,
        };
    })
    .build();
