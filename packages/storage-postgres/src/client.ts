/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

/** Options for creating a PostgreSQL-backed Agentrail storage backend. */
export interface PostgresStorageOptions {
  /**
   * PostgreSQL connection string, e.g.
   * `"postgres://user:password@localhost:5432/dbname"`.
   */
  connectionString: string;
  /**
   * PostgreSQL schema name (default: `"agentrail"`).
   * The schema must already exist; see `buildSchemaDDL()` to create it.
   */
  schema?: string;
  /**
   * Maximum number of connections in the pool (default: 10).
   */
  max?: number;
}

/**
 * Creates a `postgres` SQL client from the provided options.
 * All Agentrail PostgreSQL backends share a single client instance.
 */
export function createSqlClient(options: PostgresStorageOptions): Sql {
  return postgres(options.connectionString, {
    max: options.max ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
  });
}

/**
 * Wraps an arbitrary value for safe JSONB storage via postgres.js.
 * This cast is intentional: postgres.js accepts any serializable value at
 * runtime but the TypeScript types require a strict `JSONValue` shape that
 * domain objects like `Message` and `OrchestrationEvent` do not satisfy.
 *
 * Accepts both `Sql` and `TransactionSql` (which lack the full `Sql` surface).
 */
export function jsonParam(
  sql: { json(value: unknown): ReturnType<Sql["json"]> },
  value: unknown,
): ReturnType<Sql["json"]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (sql as any).json(value);
}
