/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { printDoctorResults, runDoctorChecks, type CheckResult } from "./doctor.js";

/**
 * Entry point for `agentrail config validate`.
 *
 * Designed for CI/CD pipelines:
 * - `--format json` outputs machine-readable JSON to stdout
 * - Exit code 1 when any check fails
 */
export async function runConfigValidate(args: string[]): Promise<void> {
  const format = parseFlag(args, "--format") ?? "human";
  const workerPath = parseFlag(args, "--worker-path");
  const configPath = parseFlag(args, "--config");
  const checkSandbox = args.includes("--check-sandbox");

  const results = await runDoctorChecks({ workerPath, configPath, checkSandbox });
  const failed = results.filter((r: CheckResult) => r.status === "fail");

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          valid: failed.length === 0,
          checks: results,
        },
        null,
        2,
      ),
    );
  } else {
    printDoctorResults(results);
    console.log();
    if (failed.length > 0) {
      console.error(`config validate: ${failed.length} check(s) failed.`);
    }
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}
