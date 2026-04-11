#!/usr/bin/env node
/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { runConfigValidate } from "./commands/config-validate.js";
import { runCreate } from "./commands/create.js";
import { runDoctor } from "./commands/doctor.js";

// ─── Public API (used by create-agentrail-app wrapper) ───────────────────────
export { runCreate } from "./commands/create.js";

// ─── CLI dispatch ─────────────────────────────────────────────────────────────

const [, , subcommand, ...rest] = process.argv;

async function main(): Promise<void> {
  switch (subcommand) {
    case "create":
      await runCreate(rest);
      break;

    case "doctor":
      await runDoctor(rest);
      break;

    case "config":
      if (rest[0] === "validate") {
        await runConfigValidate(rest.slice(1));
      } else {
        printUsage();
        process.exit(1);
      }
      break;

    default:
      printUsage();
      if (subcommand) process.exit(1);
  }
}

function printUsage(): void {
  console.log(`
agentrail — CLI for Agentrail agent applications

Usage:
  agentrail create [name]          Scaffold a new Agentrail project
  agentrail doctor [options]       Diagnose your environment
  agentrail config validate [opts] Validate config (CI-friendly)

Options for doctor / config validate:
  --config <path>         Path to agentrail.yaml (default: auto-discovered)
  --worker-path <file>    Path to orchestration worker entry to verify
  --check-sandbox         Verify sandbox Docker image availability
  --format json           (config validate only) Output machine-readable JSON
`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
