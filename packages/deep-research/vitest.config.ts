/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { resolve } from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "@agentrail/core": resolve(__dirname, "../core/src/index.ts"),
      "@agentrail/capabilities": resolve(__dirname, "../capabilities/src/index.ts"),
      "@agentrail/prompts": resolve(__dirname, "../core/src/prompts/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.js"],
  },
});
