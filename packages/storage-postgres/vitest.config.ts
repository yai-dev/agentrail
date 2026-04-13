import { resolve } from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "@agentrail/core/providers": resolve(__dirname, "../core/src/llm/providers/index.ts"),
      "@agentrail/core": resolve(__dirname, "../core/src/index.ts"),
      "@agentrail/capabilities": resolve(__dirname, "../capabilities/src/index.ts"),
      "@agentrail/app": resolve(__dirname, "../app/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // testcontainers pulls a Docker image on first run; give it plenty of time.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: "v8",
    },
  },
});
