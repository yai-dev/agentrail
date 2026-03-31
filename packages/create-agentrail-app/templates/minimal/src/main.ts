// Register built-in LLM providers (Anthropic, OpenAI) as side effects
import "@agentrail/runtime-core/providers";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { createStreamRoute } from "@agentrail/host";
import { sessionManager, sandboxManager } from "./context.js";
import { buildSummarizeFn, resolveProfile } from "./agent.js";

const app = new Hono();

app.use("*", logger());

// Optional: uncomment to require a Bearer token for all API routes
// app.use("/api/*", async (c, next) => {
//   const token = process.env.API_SECRET_TOKEN;
//   if (!token) return next();
//   if (c.req.header("Authorization") !== `Bearer ${token}`) {
//     return c.json({ error: "Unauthorized" }, 401);
//   }
//   return next();
// });

const stream = createStreamRoute({
  dataDir: process.env.DATA_DIR ?? "./data",
  defaultAgentId: "{{PROJECT_NAME}}-agent",
  sessionStore: sessionManager,
  sandboxManager,
  resolveProfile,
  summarize: buildSummarizeFn(),
  compaction: {
    triggerTokens: 40_000,
    minMessages: 10,
  },
});

app.route("/api/stream", stream);

app.get("/health", (c) => c.json({ status: "ok" }));

serve(
  { fetch: app.fetch, port: Number(process.env.PORT ?? 3000) },
  (info) => {
    console.log(
      `{{PROJECT_NAME}} server running on http://localhost:${info.port}`,
    );
  },
);
