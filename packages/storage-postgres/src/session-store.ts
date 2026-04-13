/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import {
  buildCompactionMessage,
  buildCompactionNotesEntry,
  computeCompactionSplit,
} from "@agentrail/app";
import type {
  AgentrailSessionStore,
  MemoDocumentName,
  MemoDocumentScope,
  Message,
  SessionMeta,
  SessionRef,
  Usage,
} from "@agentrail/core";
import { createSessionRef, resolveSessionRef } from "@agentrail/core";
import { randomUUID } from "node:crypto";
import type { Sql } from "./client.js";
import { jsonParam } from "./client.js";

/** Simple token estimator matching the one in @agentrail/app. */
function estimateMessageTokens(messages: Message[]): number {
  let tokens = 0;
  for (const msg of messages) {
    const text = JSON.stringify(msg);
    for (const ch of text) {
      tokens += ch.codePointAt(0)! > 0x7f ? 1 : 0.25;
    }
  }
  return Math.ceil(tokens);
}

/**
 * PostgreSQL-backed `AgentrailSessionStore`.
 *
 * All data is stored in the `agentrail` schema (or the schema provided at
 * construction time).  Run `buildSchemaDDL()` once to create the tables.
 */
export class PostgresSessionStore implements AgentrailSessionStore {
  constructor(
    private readonly sql: Sql,
    private readonly schema: string = "agentrail",
  ) {}

  private get s() {
    return this.schema;
  }

  async ping(): Promise<void> {
    await this.sql`SELECT 1`;
  }

  async getOrCreate(
    tenantId: string,
    userId: string,
    agentId: string,
    sessionId?: string,
  ): Promise<{ sessionId: string; sessionRef: SessionRef }> {
    const sid = sessionId ?? randomUUID();
    const now = Date.now();

    await this.sql`
      INSERT INTO ${this.sql(this.s)}.sessions
        (tenant_id, session_id, user_id, agent_id, created_at, updated_at)
      VALUES
        (${tenantId}, ${sid}, ${userId}, ${agentId}, ${now}, ${now})
      ON CONFLICT (tenant_id, session_id) DO NOTHING
    `;

    const sessionRef = createSessionRef(tenantId, sid);
    return { sessionId: sid, sessionRef };
  }

  async loadMessages(tenantId: string, sessionId: string, limit?: number): Promise<Message[]> {
    if (limit !== undefined) {
      const rows = await this.sql<{ message: Message }[]>`
        SELECT message FROM ${this.sql(this.s)}.session_messages
        WHERE tenant_id = ${tenantId} AND session_id = ${sessionId}
        ORDER BY seq DESC
        LIMIT ${limit}
      `;
      return rows.map((r) => r.message).reverse();
    }
    return this.loadAllMessages(tenantId, sessionId);
  }

  async loadMessagesWithBudget(
    tenantId: string,
    sessionId: string,
    tokenBudget = 40_000,
  ): Promise<Message[]> {
    const all = await this.loadAllMessages(tenantId, sessionId);
    if (all.length === 0) return [];

    let tokens = 0;
    const result: Message[] = [];
    for (let i = all.length - 1; i >= 0; i--) {
      const msgTokens = estimateMessageTokens([all[i]!]);
      if (tokens + msgTokens > tokenBudget && result.length > 0) break;
      tokens += msgTokens;
      result.unshift(all[i]!);
    }
    return result;
  }

  async loadAllMessages(tenantId: string, sessionId: string): Promise<Message[]> {
    const rows = await this.sql<{ message: Message }[]>`
      SELECT message FROM ${this.sql(this.s)}.session_messages
      WHERE tenant_id = ${tenantId} AND session_id = ${sessionId}
      ORDER BY seq ASC
    `;
    return rows.map((r) => r.message);
  }

  async appendMessages(tenantId: string, sessionId: string, messages: Message[]): Promise<void> {
    if (messages.length === 0) return;
    const now = Date.now();

    for (const msg of messages) {
      await this.sql`
        INSERT INTO ${this.sql(this.s)}.session_messages (tenant_id, session_id, message)
        VALUES (${tenantId}, ${sessionId}, ${jsonParam(this.sql, msg)})
      `;
    }

    await this.sql`
      UPDATE ${this.sql(this.s)}.sessions
      SET updated_at = ${now}
      WHERE tenant_id = ${tenantId} AND session_id = ${sessionId}
    `;
  }

  async recordTurn(tenantId: string, sessionId: string, usage: Usage): Promise<void> {
    const now = Date.now();

    const countRows = await this.sql<{ count: string }[]>`
      SELECT COUNT(*) as count
      FROM ${this.sql(this.s)}.session_turns
      WHERE tenant_id = ${tenantId} AND session_id = ${sessionId}
    `;
    const turnIndex = parseInt(countRows[0]?.count ?? "0", 10);

    await this.sql`
      INSERT INTO ${this.sql(this.s)}.session_turns
        (tenant_id, session_id, turn_index, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, recorded_at)
      VALUES
        (${tenantId}, ${sessionId}, ${turnIndex},
         ${usage.inputTokens ?? 0}, ${usage.outputTokens ?? 0},
         ${usage.cacheReadTokens ?? 0}, ${usage.cacheWriteTokens ?? 0},
         ${now})
    `;
  }

  async compactIfNeeded(
    tenantId: string,
    sessionId: string,
    summarizeFn: (messages: Message[]) => Promise<string>,
    options: {
      triggerTokens?: number;
      compactFraction?: number;
      preloadedMessages?: Message[];
      workspaceSnapshot?: string;
    } = {},
  ): Promise<boolean> {
    const { compactFraction = 1 / 3, workspaceSnapshot } = options;

    const all = options.preloadedMessages ?? (await this.loadAllMessages(tenantId, sessionId));

    const split = computeCompactionSplit(all, {
      triggerTokens: options.triggerTokens,
      compactFraction,
    });
    if (!split) return false;

    const { toCompact, toKeep, totalTokens } = split;

    const summary = await summarizeFn(toCompact);
    const timestamp = new Date().toISOString();
    const archiveId = randomUUID();

    const compactionMsg = buildCompactionMessage({
      summary,
      archiveId,
      toCompact,
      totalTokens,
      compactFraction,
      timestamp,
      workspaceSnapshot,
    });

    // Archive the compacted messages.
    await this.sql`
      INSERT INTO ${this.sql(this.s)}.session_message_archives
        (tenant_id, session_id, archive_id, messages)
      VALUES
        (${tenantId}, ${sessionId}, ${archiveId}, ${jsonParam(this.sql, toCompact)})
    `;

    // Rewrite visible messages: delete all and re-insert compaction + kept.
    await this.sql.begin(async (sql) => {
      await sql`
        DELETE FROM ${sql(this.s)}.session_messages
        WHERE tenant_id = ${tenantId} AND session_id = ${sessionId}
      `;
      const newMessages = [compactionMsg, ...toKeep];
      for (const msg of newMessages) {
        await sql`
          INSERT INTO ${sql(this.s)}.session_messages (tenant_id, session_id, message)
          VALUES (${tenantId}, ${sessionId}, ${jsonParam(sql, msg)})
        `;
      }
    });

    // Append compaction summary to NOTES.md.
    const notesEntry = buildCompactionNotesEntry({
      summary,
      archiveId,
      compressedCount: toCompact.length,
      timestamp,
    });
    await this.appendMemoryDocument(tenantId, sessionId, "session", "NOTES.md", notesEntry);

    return true;
  }

  // ─── Memo Documents ────────────────────────────────────────────────────────

  async readMemoryDocument(
    tenantId: string,
    ownerId: string,
    scope: MemoDocumentScope,
    name: MemoDocumentName,
  ): Promise<string | null> {
    const rows = await this.sql<{ content: string }[]>`
      SELECT content FROM ${this.sql(this.s)}.memory_documents
      WHERE tenant_id = ${tenantId}
        AND owner_scope = ${scope}
        AND owner_id = ${ownerId}
        AND name = ${name}
    `;
    return rows[0]?.content ?? null;
  }

  async writeMemoryDocument(
    tenantId: string,
    ownerId: string,
    scope: MemoDocumentScope,
    name: MemoDocumentName,
    content: string,
  ): Promise<void> {
    const now = Date.now();
    await this.sql`
      INSERT INTO ${this.sql(this.s)}.memory_documents
        (tenant_id, owner_scope, owner_id, name, content, updated_at)
      VALUES
        (${tenantId}, ${scope}, ${ownerId}, ${name}, ${content}, ${now})
      ON CONFLICT (tenant_id, owner_scope, owner_id, name)
      DO UPDATE SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at
    `;
  }

  async appendMemoryDocument(
    tenantId: string,
    ownerId: string,
    scope: MemoDocumentScope,
    name: MemoDocumentName,
    content: string,
  ): Promise<void> {
    const now = Date.now();
    await this.sql`
      INSERT INTO ${this.sql(this.s)}.memory_documents
        (tenant_id, owner_scope, owner_id, name, content, updated_at)
      VALUES
        (${tenantId}, ${scope}, ${ownerId}, ${name}, ${content}, ${now})
      ON CONFLICT (tenant_id, owner_scope, owner_id, name)
      DO UPDATE SET
        content = ${this.sql(this.s)}.memory_documents.content || EXCLUDED.content,
        updated_at = EXCLUDED.updated_at
    `;
  }

  // ─── Tool-Result Artifacts ─────────────────────────────────────────────────

  async readToolResultArtifact(sessionRef: SessionRef, toolCallId: string): Promise<string | null> {
    const { tenantId, sessionId } = resolveSessionRef(sessionRef);
    const rows = await this.sql<{ content: string }[]>`
      SELECT content FROM ${this.sql(this.s)}.tool_result_artifacts
      WHERE tenant_id = ${tenantId}
        AND session_id = ${sessionId}
        AND tool_call_id = ${toolCallId}
    `;
    return rows[0]?.content ?? null;
  }

  async writeToolResultArtifact(
    sessionRef: SessionRef,
    toolCallId: string,
    content: string,
  ): Promise<void> {
    const { tenantId, sessionId } = resolveSessionRef(sessionRef);
    const now = Date.now();
    await this.sql`
      INSERT INTO ${this.sql(this.s)}.tool_result_artifacts
        (tenant_id, session_id, tool_call_id, content, updated_at)
      VALUES
        (${tenantId}, ${sessionId}, ${toolCallId}, ${content}, ${now})
      ON CONFLICT (tenant_id, session_id, tool_call_id)
      DO UPDATE SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at
    `;
  }

  // ─── UserSessionLister ────────────────────────────────────────────────────

  /**
   * Lists all sessions belonging to the given user, ordered by most recently
   * updated first.  Satisfies the `UserSessionLister` interface so this store
   * can be passed directly to `UserMemoryConsolidationService`.
   */
  async listSessionsByUser(tenantId: string, userId: string): Promise<SessionMeta[]> {
    const rows = await this.sql<{ session_id: string; updated_at: string }[]>`
      SELECT session_id, updated_at
      FROM ${this.sql(this.s)}.sessions
      WHERE tenant_id = ${tenantId}
        AND user_id = ${userId}
      ORDER BY updated_at DESC
    `;
    return rows.map((r) => ({
      sessionId: r.session_id,
      updatedAt: Number(r.updated_at),
    }));
  }
}
