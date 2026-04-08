/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function getWorkerPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const extension = currentFile.endsWith(".ts") ? ".ts" : ".js";
  return join(dirname(currentFile), `default-subagent-worker-entry${extension}`);
}
