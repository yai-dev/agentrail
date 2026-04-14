/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// Register built-in LLM providers (Anthropic, OpenAI) as side effects
import "@agentrail/core/providers";

import {
  createAgentApp,
  type SessionTraceStore,
  type WorkflowTraceEventEnvelope,
} from "@agentrail/app";
import type { SessionRef } from "@agentrail/core";
import {
  PostgresSessionStore,
  createPostgresSessionTraceStore,
  createSqlClient,
} from "@agentrail/storage-postgres";
import { serve } from "@hono/node-server";
import { buildSummarizeFn, defaultProfile } from "./agent.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const sql = createSqlClient({ connectionString });

const app = createAgentApp({
  profiles: [defaultProfile],
  summarize: buildSummarizeFn(),
  sessionStore: new PostgresSessionStore(sql),
  traceStoreFactory: createPostgresSessionTraceStore(sql) as unknown as (
    sessionRef: SessionRef,
  ) => SessionTraceStore<WorkflowTraceEventEnvelope>,
  compaction: {
    triggerTokens: 40_000,
    minMessages: 10,
  },
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) => {
  console.log(`pg-backend-agent-server running on http://localhost:${info.port}`);
  console.log(
    `Connected to PostgreSQL: ${connectionString.replace(/:\/\/[^@]+@/, "://<redacted>@")}`,
  );
});
