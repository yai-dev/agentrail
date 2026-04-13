/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SessionTraceStore } from "@agentrail/app";
import type { SessionRef } from "@agentrail/core";
import { resolveSessionRef } from "@agentrail/core";
import { jsonParam, type Sql } from "./client.js";

/**
 * PostgreSQL-backed `SessionTraceStore`.
 *
 * Envelopes are appended in insertion order and loaded back in the same order.
 */
export class PostgresSessionTraceStore<
  TEnvelope = Record<string, unknown>,
> implements SessionTraceStore<TEnvelope> {
  private readonly tenantId: string;
  private readonly sessionId: string;

  constructor(
    private readonly sql: Sql,
    sessionRef: SessionRef,
    private readonly schema = "agentrail",
  ) {
    const resolved = resolveSessionRef(sessionRef);
    this.tenantId = resolved.tenantId;
    this.sessionId = resolved.sessionId;
  }

  async appendEnvelope(envelope: TEnvelope): Promise<void> {
    await this.sql`
      INSERT INTO ${this.sql(this.schema)}.trace_envelopes
        (tenant_id, session_id, envelope)
      VALUES
        (${this.tenantId}, ${this.sessionId}, ${jsonParam(this.sql, envelope)})
    `;
  }

  async loadEnvelopes(): Promise<TEnvelope[]> {
    const rows = await this.sql<{ envelope: TEnvelope }[]>`
      SELECT envelope FROM ${this.sql(this.schema)}.trace_envelopes
      WHERE tenant_id = ${this.tenantId} AND session_id = ${this.sessionId}
      ORDER BY seq ASC
    `;
    return rows.map((r) => r.envelope);
  }
}

/**
 * Factory function that creates a `PostgresSessionTraceStore` for a given session.
 * Use this as the `traceStoreFactory` option in `createAgentApp`.
 */
export function createPostgresSessionTraceStore(
  sql: Sql,
  schema = "agentrail",
): (sessionRef: SessionRef) => SessionTraceStore {
  return (sessionRef) => new PostgresSessionTraceStore(sql, sessionRef, schema);
}
