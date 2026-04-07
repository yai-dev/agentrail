/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(async () => {
  const { getPlaygroundUiConfig } = await import("@agentrail/app");
  const config = getPlaygroundUiConfig();
  const backendPort = String(config.backendPort);
  const uiPort = config.port;

  const proxyConfig = {
    "/api": { target: `http://localhost:${backendPort}`, changeOrigin: true },
    "/health": { target: `http://localhost:${backendPort}`, changeOrigin: true },
  };

  return {
    plugins: [react()],
    server: {
      port: uiPort,
      proxy: proxyConfig,
    },
    preview: {
      port: uiPort,
      proxy: proxyConfig,
    },
  };
});
