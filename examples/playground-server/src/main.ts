/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// Register built-in LLM providers (Anthropic, OpenAI) as side effects
import "@agentrail/core/providers";

import { runPluginLifecycle } from "@agentrail/app";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { config } from "@/config.js";
import { sandboxManager } from "@/context/index.js";
import { playgroundPlugins } from "@/plugins/index.js";
import { chat } from "@/routes/chat.js";
import { commands } from "@/routes/commands.js";
import { deepResearch } from "@/routes/deep-research.js";
import { health } from "@/routes/health.js";
import { knowledge } from "@/routes/knowledge.js";
import { orchestration } from "@/routes/orchestration.js";
import { sessions } from "@/routes/sessions.js";
import { stream } from "@/routes/stream.js";
import { trace } from "@/routes/trace.js";

const app = new Hono();

app.use("*", logger());

// Auth middleware: validates Bearer token for all /api/* routes.
// Skipped transparently when UI_SECRET_TOKEN is not configured.
app.use("/api/*", async (c, next) => {
  if (!config.uiSecretToken) return next();
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${config.uiSecretToken}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});

app.route("/health", health);
app.route("/api/chat", chat);
app.route("/api/stream", stream);
app.route("/api/commands", commands);
app.route("/api/sessions", sessions);
app.route("/api/sessions", orchestration);
app.route("/api/sessions", deepResearch);
app.route("/api/sessions", trace);
app.route("/api/knowledge", knowledge);

// Pre-pull sandbox image at startup so the first request doesn't wait.
// Non-blocking: server starts immediately, pull runs in the background.
void sandboxManager.ensureImage().catch((err: unknown) => {
  console.warn("[sandbox] Image pre-pull failed (will retry on first use):", err);
});
void runPluginLifecycle(playgroundPlugins, "start");

const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`Agentrail Playground Server running on http://localhost:${info.port}`);
  },
);

// Destroy all sandbox containers on graceful shutdown
async function onShutdown() {
  console.log("[sandbox] Shutting down — destroying all containers...");
  await runPluginLifecycle(playgroundPlugins, "stop").catch(() => {});
  await sandboxManager.destroyAll().catch(() => {});
  process.exit(0);
}

process.on("SIGINT", () => void onShutdown());
process.on("SIGTERM", () => void onShutdown());
