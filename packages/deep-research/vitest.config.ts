/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@agentrail/prompts": resolve(__dirname, "../prompts/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.js"],
  },
});
