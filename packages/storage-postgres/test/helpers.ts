/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll } from "vitest";
import { createSqlClient, type Sql } from "../src/client.js";
import { buildSchemaDDL } from "../src/schema.js";

export interface PgFixture {
  sql: Sql;
}

/**
 * Starts a PostgreSQL test container and applies the Agentrail schema.
 * Call this in a `describe` block — it registers `beforeAll` / `afterAll` hooks.
 */
export function usePgContainer(): PgFixture {
  let container: StartedPostgreSqlContainer;
  const fixture: PgFixture = { sql: null! };

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();

    fixture.sql = createSqlClient({
      connectionString: container.getConnectionUri(),
    });

    // Create schema and tables.
    await fixture.sql.unsafe(`CREATE SCHEMA IF NOT EXISTS agentrail;`);
    await fixture.sql.unsafe(buildSchemaDDL("agentrail"));
  });

  afterAll(async () => {
    await fixture.sql?.end();
    await container?.stop();
  });

  return fixture;
}

/** Helper to build a simple user message. */
export function userMsg(text: string) {
  return {
    role: "user" as const,
    content: text,
    timestamp: Date.now(),
  };
}

/** Helper to build a simple assistant message. */
export function assistantMsg(text: string) {
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text }],
    stopReason: "stop" as const,
    provider: "mock",
    modelId: "mock",
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 15,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    timestamp: Date.now(),
  };
}
