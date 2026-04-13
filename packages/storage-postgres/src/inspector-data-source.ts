/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  InspectorDataSource,
  InspectorSessionItem,
  WorkflowTraceEventEnvelope,
} from "@agentrail/app";
import type {
  OrchestrationEvent,
  OrchestrationSnapshot,
  RecoveredOrchestrationState,
} from "@agentrail/capabilities";
import { recoverOrchestrationState } from "@agentrail/capabilities";
import type { Message } from "@agentrail/core";
import type { Sql } from "./client.js";

/**
 * PostgreSQL-backed `InspectorDataSource`.
 *
 * Reads session metadata, messages, trace envelopes, and orchestration state
 * directly from PostgreSQL tables created by `buildSchemaDDL()`.
 * Does not depend on any filesystem layout.
 */
export class PostgresInspectorDataSource implements InspectorDataSource {
  constructor(
    private readonly sql: Sql,
    private readonly schema = "agentrail",
  ) {}

  private get s() {
    return this.schema;
  }

  async listSessions(): Promise<InspectorSessionItem[]> {
    const rows = await this.sql<
      {
        tenant_id: string;
        session_id: string;
        user_id: string;
        updated_at: string;
      }[]
    >`
      SELECT tenant_id, session_id, user_id, updated_at
      FROM ${this.sql(this.s)}.sessions
      ORDER BY updated_at DESC
    `;

    const items: InspectorSessionItem[] = await Promise.all(
      rows.map(async (row) => {
        const [turnsRows, traceRows] = await Promise.all([
          this.sql<{ count: string; total_tokens: string }[]>`
            SELECT
              COUNT(*) AS count,
              COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens
            FROM ${this.sql(this.s)}.session_turns
            WHERE tenant_id = ${row.tenant_id} AND session_id = ${row.session_id}
          `,
          this.sql<{ ts: string }[]>`
            SELECT envelope->>'timestamp' AS ts
            FROM ${this.sql(this.s)}.trace_envelopes
            WHERE tenant_id = ${row.tenant_id} AND session_id = ${row.session_id}
            ORDER BY seq DESC
            LIMIT 1
          `,
        ]);

        const turns = parseInt(turnsRows[0]?.count ?? "0", 10);
        const tokens = parseInt(turnsRows[0]?.total_tokens ?? "0", 10);
        const lastActive = traceRows[0]?.ts ?? new Date(Number(row.updated_at)).toISOString();

        return {
          tenantId: row.tenant_id,
          sessionId: row.session_id,
          userId: row.user_id,
          lastActive,
          turns: turns > 0 ? turns : undefined,
          tokens: tokens > 0 ? tokens : undefined,
          status: "idle" as const,
        };
      }),
    );

    return items;
  }

  async loadMessages(tenantId: string, sessionId: string): Promise<Message[]> {
    const rows = await this.sql<{ message: Message }[]>`
      SELECT message
      FROM ${this.sql(this.s)}.session_messages
      WHERE tenant_id = ${tenantId} AND session_id = ${sessionId}
      ORDER BY seq ASC
    `;
    return rows.map((r) => r.message);
  }

  async loadTraceEnvelopes(
    tenantId: string,
    sessionId: string,
  ): Promise<WorkflowTraceEventEnvelope[]> {
    const rows = await this.sql<{ envelope: WorkflowTraceEventEnvelope }[]>`
      SELECT envelope
      FROM ${this.sql(this.s)}.trace_envelopes
      WHERE tenant_id = ${tenantId} AND session_id = ${sessionId}
      ORDER BY seq ASC
    `;
    return rows.map((r) => r.envelope);
  }

  async loadOrchestrationState(
    tenantId: string,
    sessionId: string,
  ): Promise<RecoveredOrchestrationState | null> {
    const [snapshotRows, eventsRows] = await Promise.all([
      this.sql<{ snapshot: OrchestrationSnapshot }[]>`
        SELECT snapshot
        FROM ${this.sql(this.s)}.orchestration_snapshots
        WHERE tenant_id = ${tenantId} AND session_id = ${sessionId}
      `,
      this.sql<{ event: OrchestrationEvent }[]>`
        SELECT event
        FROM ${this.sql(this.s)}.orchestration_events
        WHERE tenant_id = ${tenantId} AND session_id = ${sessionId}
        ORDER BY seq ASC
      `,
    ]);

    const snapshot = snapshotRows[0]?.snapshot ?? null;
    const events = eventsRows.map((r) => r.event);

    if (!snapshot && events.length === 0) return null;
    return recoverOrchestrationState(snapshot, events);
  }

  async loadOrchestrationEvents(tenantId: string, sessionId: string): Promise<unknown[]> {
    const rows = await this.sql<{ event: unknown }[]>`
      SELECT event
      FROM ${this.sql(this.s)}.orchestration_events
      WHERE tenant_id = ${tenantId} AND session_id = ${sessionId}
      ORDER BY seq ASC
    `;
    return rows.map((r) => r.event);
  }
}
