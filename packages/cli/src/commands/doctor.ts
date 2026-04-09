/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { access, constants, stat } from "node:fs/promises";
import { loadAgentrailConfig } from "@agentrail/app";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CheckResult {
  name: string;
  status: "ok" | "warn" | "fail" | "skip";
  message: string;
}

export interface DoctorOptions {
  /** Path to the Agentrail config file (default: auto-discovered). */
  configPath?: string;
  /**
   * Path to the orchestration worker entry file.
   * Only checked when `orchestration.subagent` is configured in the YAML and
   * `fakeExecution` is not `"echo"`. When absent and the condition applies,
   * the check is skipped with a hint.
   */
  workerPath?: string;
  /** When true, verify sandbox image availability via docker CLI. */
  checkSandbox?: boolean;
  /** Output format. Default: "human". */
  format?: "human" | "json";
}

// ─── Individual checks ────────────────────────────────────────────────────────

async function checkEnvVars(
  config: Awaited<ReturnType<typeof loadAgentrailConfig>>,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // LLM provider key — only check env var when the config field itself is empty
  const llmProvider = config.llm?.provider ?? "";
  if (llmProvider === "openai" && !config.llm?.baseUrl) {
    const key = "OPENAI_API_KEY";
    const present = Boolean(process.env[key]);
    results.push({
      name: `env.${key}`,
      status: present ? "ok" : "fail",
      message: present ? `${key} found` : `${key} missing — set it in your environment`,
    });
  } else if (llmProvider === "anthropic") {
    const key = "ANTHROPIC_API_KEY";
    const present = Boolean(process.env[key]);
    results.push({
      name: `env.${key}`,
      status: present ? "ok" : "fail",
      message: present ? `${key} found` : `${key} missing — set it in your environment`,
    });
  }

  // Search provider key — skip when tavilyApiKey is already set in config
  const tavilyInConfig = Boolean(config.search?.tavilyApiKey);
  if (!tavilyInConfig && config.search?.provider === "tavily") {
    const key = "TAVILY_API_KEY";
    const present = Boolean(process.env[key]);
    results.push({
      name: `env.${key}`,
      status: present ? "ok" : "fail",
      message: present ? `${key} found` : `${key} missing — set it in env or config`,
    });
  }

  return results;
}

async function checkDataDir(dataDir: string): Promise<CheckResult> {
  try {
    await access(dataDir, constants.W_OK);
    return { name: "data_dir", status: "ok", message: `${dataDir} is writable` };
  } catch {
    return {
      name: "data_dir",
      status: "fail",
      message: `${dataDir} is not writable or does not exist — create it or fix permissions`,
    };
  }
}

async function checkSandboxImage(image: string): Promise<CheckResult> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  try {
    await execFileAsync("docker", ["image", "inspect", image]);
    return { name: "sandbox_image", status: "ok", message: `${image} found locally` };
  } catch {
    return {
      name: "sandbox_image",
      status: "warn",
      message: `${image} not found locally — run: docker pull ${image}`,
    };
  }
}

async function checkWorkerPath(workerPath: string): Promise<CheckResult> {
  try {
    await stat(workerPath);
    return { name: "worker_path", status: "ok", message: `${workerPath} exists` };
  } catch {
    return {
      name: "worker_path",
      status: "fail",
      message: `${workerPath} not found — run your build step first`,
    };
  }
}

// ─── Main doctor runner ───────────────────────────────────────────────────────

/**
 * Runs the full doctor check suite and returns structured results.
 * Called by both the interactive `agentrail doctor` command and
 * `agentrail config validate`.
 */
export async function runDoctorChecks(opts: DoctorOptions): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ── 1. Load config ─────────────────────────────────────────────────────────
  let config: Awaited<ReturnType<typeof loadAgentrailConfig>>;
  try {
    // Pass an options object so loadAgentrailConfig can run its own discovery
    // logic; passing the raw string would be silently ignored (type mismatch).
    config = loadAgentrailConfig(opts.configPath ? { configPath: opts.configPath } : {});
  } catch (err) {
    results.push({
      name: "config",
      status: "fail",
      message: `Failed to load config: ${err instanceof Error ? err.message : String(err)}`,
    });
    return results;
  }

  results.push({ name: "config", status: "ok", message: "agentrail.yaml loaded" });

  // ── 2. Env vars ────────────────────────────────────────────────────────────
  const envResults = await checkEnvVars(config);
  results.push(...envResults);

  // ── 3. Data dir ────────────────────────────────────────────────────────────
  const dataDir = config.paths?.dataDir;
  if (dataDir) {
    results.push(await checkDataDir(dataDir));
  } else {
    results.push({ name: "data_dir", status: "skip", message: "paths.dataDir not set in config" });
  }

  // ── 4. Sandbox image (conditional) ────────────────────────────────────────
  const sandboxImage = config.sandbox?.image;
  if (sandboxImage && opts.checkSandbox) {
    results.push(await checkSandboxImage(sandboxImage));
  } else if (sandboxImage) {
    results.push({
      name: "sandbox_image",
      status: "skip",
      message: `Skipped — pass --check-sandbox to verify ${sandboxImage}`,
    });
  }

  // ── 5. Worker path (conditional) ───────────────────────────────────────────
  const orchestrationCfg = config.orchestration?.subagent;
  const needsWorker =
    orchestrationCfg !== undefined &&
    orchestrationCfg.fakeExecution !== "echo";

  if (needsWorker) {
    if (opts.workerPath) {
      results.push(await checkWorkerPath(opts.workerPath));
    } else {
      results.push({
        name: "worker_path",
        status: "skip",
        message:
          "orchestration.subagent is configured — pass --worker-path <file> to verify the worker entry",
      });
    }
  }

  return results;
}

// ─── Human-readable output ────────────────────────────────────────────────────

const ICONS: Record<CheckResult["status"], string> = {
  ok: "✓",
  warn: "⚠",
  fail: "✗",
  skip: "–",
};

export function printDoctorResults(results: CheckResult[]): void {
  const maxName = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    const icon = ICONS[r.status];
    const pad = r.name.padEnd(maxName + 2);
    console.log(`  ${icon}  ${pad}${r.message}`);
  }
}

/**
 * Entry point for `agentrail doctor`.
 * Interactive, colored, human-readable output.
 */
export async function runDoctor(args: string[]): Promise<void> {
  const workerPath = parseFlag(args, "--worker-path");
  const configPath = parseFlag(args, "--config");
  const checkSandbox = args.includes("--check-sandbox");

  console.log("\nagentrail doctor\n");

  const results = await runDoctorChecks({ workerPath, configPath, checkSandbox });
  printDoctorResults(results);

  const failed = results.filter((r) => r.status === "fail");
  console.log();
  if (failed.length === 0) {
    console.log("  All checks passed.");
  } else {
    console.log(`  ${failed.length} check(s) failed.`);
    process.exitCode = 1;
  }
  console.log();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}
