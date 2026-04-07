/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import "@agentrail/core/providers";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { config } from "./config.js";
import { sandboxManager } from "./context/index.js";
import { deepResearch } from "./routes/deep-research.js";
import { health } from "./routes/health.js";
import { run } from "./routes/run.js";

const app = new Hono();

app.use("*", logger());

app.use("/api/*", async (c, next) => {
  if (!config.uiSecretToken) return next();
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${config.uiSecretToken}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});

app.route("/health", health);
app.route("/api/deep-research/run", run);
app.route("/api/sessions", deepResearch);

void sandboxManager.ensureImage().catch((error: unknown) => {
  console.warn("[sandbox] Image pre-pull failed (will retry on first use):", error);
});

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`Agentrail Deep Research example running on http://localhost:${info.port}`);
  },
);
