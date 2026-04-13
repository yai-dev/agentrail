/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  OrchestrationEvent,
  OrchestrationMailboxEvent,
  OrchestrationMailboxState,
  OrchestrationPersistence,
  OrchestrationSnapshot,
  RecoveredOrchestrationState,
} from "@agentrail/capabilities";
import { recoverOrchestrationState } from "@agentrail/capabilities";
import type { SessionRef } from "@agentrail/core";
import { resolveSessionRef } from "@agentrail/core";
import { jsonParam, type Sql } from "./client.js";

/**
 * PostgreSQL-backed `OrchestrationPersistence`.
 *
 * Events, snapshots, mailbox state, and agent histories are all stored in
 * PostgreSQL.  Use `createPostgresOrchestrationPersistence` as the
 * `createPersistence` option for `createOrchestrationRegistry`.
 */
export class PostgresOrchestrationPersistence implements OrchestrationPersistence {
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

  private get s() {
    return this.schema;
  }

  async appendEvent(event: OrchestrationEvent): Promise<void> {
    await this.sql`
      INSERT INTO ${this.sql(this.s)}.orchestration_events
        (tenant_id, session_id, event)
      VALUES
        (${this.tenantId}, ${this.sessionId}, ${jsonParam(this.sql, event)})
    `;
  }

  async loadEvents(): Promise<OrchestrationEvent[]> {
    const rows = await this.sql<{ event: OrchestrationEvent }[]>`
      SELECT event FROM ${this.sql(this.s)}.orchestration_events
      WHERE tenant_id = ${this.tenantId} AND session_id = ${this.sessionId}
      ORDER BY seq ASC
    `;
    return rows.map((r) => r.event);
  }

  async loadSnapshot(): Promise<OrchestrationSnapshot | null> {
    const rows = await this.sql<{ snapshot: OrchestrationSnapshot }[]>`
      SELECT snapshot FROM ${this.sql(this.s)}.orchestration_snapshots
      WHERE tenant_id = ${this.tenantId} AND session_id = ${this.sessionId}
    `;
    return rows[0]?.snapshot ?? null;
  }

  async writeCheckpoint(snapshot: OrchestrationSnapshot): Promise<void> {
    const now = Date.now();
    await this.sql`
      INSERT INTO ${this.sql(this.s)}.orchestration_snapshots
        (tenant_id, session_id, snapshot, updated_at)
      VALUES
        (${this.tenantId}, ${this.sessionId}, ${jsonParam(this.sql, snapshot)}, ${now})
      ON CONFLICT (tenant_id, session_id)
      DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = EXCLUDED.updated_at
    `;
  }

  async recoverState(): Promise<RecoveredOrchestrationState> {
    const [snapshot, events] = await Promise.all([this.loadSnapshot(), this.loadEvents()]);
    return recoverOrchestrationState(snapshot, events);
  }

  async appendMailboxEvent(agentId: string, event: OrchestrationMailboxEvent): Promise<void> {
    await this.sql`
      INSERT INTO ${this.sql(this.s)}.orchestration_mailbox_events
        (tenant_id, session_id, agent_id, event)
      VALUES
        (${this.tenantId}, ${this.sessionId}, ${agentId}, ${jsonParam(this.sql, event)})
    `;
  }

  async loadMailboxEvents(agentId: string): Promise<OrchestrationMailboxEvent[]> {
    const rows = await this.sql<{ event: OrchestrationMailboxEvent }[]>`
      SELECT event FROM ${this.sql(this.s)}.orchestration_mailbox_events
      WHERE tenant_id = ${this.tenantId}
        AND session_id = ${this.sessionId}
        AND agent_id = ${agentId}
      ORDER BY seq ASC
    `;
    return rows.map((r) => r.event);
  }

  async loadMailboxState(agentId: string): Promise<OrchestrationMailboxState> {
    const rows = await this.sql<{ state: OrchestrationMailboxState }[]>`
      SELECT state FROM ${this.sql(this.s)}.orchestration_mailbox_states
      WHERE tenant_id = ${this.tenantId}
        AND session_id = ${this.sessionId}
        AND agent_id = ${agentId}
    `;
    return (
      rows[0]?.state ?? {
        processedEventCount: 0,
        closeRequested: false,
        pendingInputIds: [],
      }
    );
  }

  async writeMailboxState(agentId: string, state: OrchestrationMailboxState): Promise<void> {
    const now = Date.now();
    await this.sql`
      INSERT INTO ${this.sql(this.s)}.orchestration_mailbox_states
        (tenant_id, session_id, agent_id, state, updated_at)
      VALUES
        (${this.tenantId}, ${this.sessionId}, ${agentId}, ${jsonParam(this.sql, state)}, ${now})
      ON CONFLICT (tenant_id, session_id, agent_id)
      DO UPDATE SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at
    `;
  }

  async loadAgentHistory(agentId: string): Promise<unknown[]> {
    const rows = await this.sql<{ history: unknown[] }[]>`
      SELECT history FROM ${this.sql(this.s)}.orchestration_agent_histories
      WHERE tenant_id = ${this.tenantId}
        AND session_id = ${this.sessionId}
        AND agent_id = ${agentId}
    `;
    return rows[0]?.history ?? [];
  }

  async writeAgentHistory(agentId: string, history: unknown[]): Promise<void> {
    const now = Date.now();
    await this.sql`
      INSERT INTO ${this.sql(this.s)}.orchestration_agent_histories
        (tenant_id, session_id, agent_id, history, updated_at)
      VALUES
        (${this.tenantId}, ${this.sessionId}, ${agentId}, ${jsonParam(this.sql, history)}, ${now})
      ON CONFLICT (tenant_id, session_id, agent_id)
      DO UPDATE SET history = EXCLUDED.history, updated_at = EXCLUDED.updated_at
    `;
  }
}

/**
 * Factory that creates a `PostgresOrchestrationPersistence` for each session.
 * Pass the returned function as `createPersistence` to `createOrchestrationRegistry`.
 */
export function createPostgresOrchestrationPersistence(
  sql: Sql,
  schema = "agentrail",
): (sessionRef: SessionRef) => OrchestrationPersistence {
  return (sessionRef) => new PostgresOrchestrationPersistence(sql, sessionRef, schema);
}
