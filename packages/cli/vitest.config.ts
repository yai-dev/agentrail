/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "@agentrail/app": resolve(__dirname, "../app/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
