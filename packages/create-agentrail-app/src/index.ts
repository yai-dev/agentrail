#!/usr/bin/env node
/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/**
 * Thin shim for backwards compatibility with `npm create agentrail-app` and
 * `pnpm dlx @agentrail/create-agentrail-app`.
 *
 * All scaffolding logic lives in `@agentrail/cli`. This package preserves the
 * `create-agentrail-app` package name so that the `npm create` / `pnpm create`
 * convention continues to work without requiring users to update their workflow.
 */
import { runCreate } from "@agentrail/cli";

const [, , ...args] = process.argv;

runCreate(args).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
