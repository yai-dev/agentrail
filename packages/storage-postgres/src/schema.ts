/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 *
 * PostgreSQL schema DDL for all Agentrail storage tables.
 *
 * All tables are created inside the schema specified at construction time
 * (default: `agentrail`).  Create the schema before running migrations:
 *
 *   CREATE SCHEMA IF NOT EXISTS agentrail;
 */

/**
 * Returns the DDL statements that create the Agentrail storage schema.
 * Pass the result to `sql.unsafe(ddl)` or execute it via `psql`.
 *
 * All statements are idempotent (uses `CREATE TABLE IF NOT EXISTS`, etc.).
 *
 * @param schema - PostgreSQL schema name (default: `"agentrail"`)
 */
export function buildSchemaDDL(schema = "agentrail"): string {
  const s = schema;
  return `
-- ═══════════════════════════════════════════════════════════════════════
-- Session / memory
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ${s}.sessions (
  tenant_id   TEXT        NOT NULL,
  session_id  TEXT        NOT NULL,
  user_id     TEXT        NOT NULL,
  agent_id    TEXT        NOT NULL,
  title       TEXT,
  created_at  BIGINT      NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at  BIGINT      NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  PRIMARY KEY (tenant_id, session_id)
);

CREATE TABLE IF NOT EXISTS ${s}.session_messages (
  tenant_id   TEXT        NOT NULL,
  session_id  TEXT        NOT NULL,
  seq         BIGSERIAL,
  message     JSONB       NOT NULL,
  PRIMARY KEY (tenant_id, session_id, seq)
);

CREATE INDEX IF NOT EXISTS ${s}_session_messages_seq
  ON ${s}.session_messages (tenant_id, session_id, seq DESC);

CREATE TABLE IF NOT EXISTS ${s}.session_message_archives (
  tenant_id   TEXT        NOT NULL,
  session_id  TEXT        NOT NULL,
  archive_id  TEXT        NOT NULL,
  messages    JSONB       NOT NULL,
  archived_at BIGINT      NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  PRIMARY KEY (tenant_id, session_id, archive_id)
);

CREATE TABLE IF NOT EXISTS ${s}.session_turns (
  tenant_id         TEXT        NOT NULL,
  session_id        TEXT        NOT NULL,
  turn_index        INT         NOT NULL,
  input_tokens      INT         NOT NULL DEFAULT 0,
  output_tokens     INT         NOT NULL DEFAULT 0,
  cache_read_tokens INT         NOT NULL DEFAULT 0,
  cache_write_tokens INT        NOT NULL DEFAULT 0,
  recorded_at       BIGINT      NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  PRIMARY KEY (tenant_id, session_id, turn_index)
);

-- Memo documents: NOTES.md (session), TODO.md (session), USER.md (user)
CREATE TABLE IF NOT EXISTS ${s}.memory_documents (
  tenant_id   TEXT        NOT NULL,
  owner_scope TEXT        NOT NULL CHECK (owner_scope IN ('session', 'user')),
  owner_id    TEXT        NOT NULL,
  name        TEXT        NOT NULL CHECK (name IN ('NOTES.md', 'TODO.md', 'USER.md')),
  content     TEXT        NOT NULL DEFAULT '',
  updated_at  BIGINT      NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  PRIMARY KEY (tenant_id, owner_scope, owner_id, name)
);

-- Compacted tool-result artifacts
CREATE TABLE IF NOT EXISTS ${s}.tool_result_artifacts (
  tenant_id   TEXT        NOT NULL,
  session_id  TEXT        NOT NULL,
  tool_call_id TEXT       NOT NULL,
  content     TEXT        NOT NULL,
  updated_at  BIGINT      NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  PRIMARY KEY (tenant_id, session_id, tool_call_id)
);

CREATE TABLE IF NOT EXISTS ${s}.session_todos (
  tenant_id   TEXT        NOT NULL,
  session_id  TEXT        NOT NULL,
  content     TEXT        NOT NULL DEFAULT '',
  updated_at  BIGINT      NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  PRIMARY KEY (tenant_id, session_id)
);

CREATE TABLE IF NOT EXISTS ${s}.skill_sub_agent_logs (
  id          BIGSERIAL   PRIMARY KEY,
  tenant_id   TEXT        NOT NULL,
  session_id  TEXT        NOT NULL,
  skill_name  TEXT        NOT NULL,
  task        TEXT        NOT NULL,
  input       TEXT        NOT NULL,
  system_prompt TEXT      NOT NULL,
  messages    JSONB       NOT NULL,
  result_text TEXT        NOT NULL,
  started_at  BIGINT      NOT NULL,
  finished_at BIGINT      NOT NULL
);

CREATE INDEX IF NOT EXISTS ${s}_skill_logs_session
  ON ${s}.skill_sub_agent_logs (tenant_id, session_id);

-- ═══════════════════════════════════════════════════════════════════════
-- Trace
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ${s}.trace_envelopes (
  tenant_id   TEXT        NOT NULL,
  session_id  TEXT        NOT NULL,
  seq         BIGSERIAL,
  envelope    JSONB       NOT NULL,
  PRIMARY KEY (tenant_id, session_id, seq)
);

CREATE INDEX IF NOT EXISTS ${s}_trace_envelopes_session
  ON ${s}.trace_envelopes (tenant_id, session_id, seq ASC);

-- ═══════════════════════════════════════════════════════════════════════
-- Orchestration
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ${s}.orchestration_events (
  tenant_id   TEXT        NOT NULL,
  session_id  TEXT        NOT NULL,
  seq         BIGSERIAL,
  event       JSONB       NOT NULL,
  PRIMARY KEY (tenant_id, session_id, seq)
);

CREATE INDEX IF NOT EXISTS ${s}_orchestration_events_session
  ON ${s}.orchestration_events (tenant_id, session_id, seq ASC);

CREATE TABLE IF NOT EXISTS ${s}.orchestration_snapshots (
  tenant_id   TEXT        NOT NULL,
  session_id  TEXT        NOT NULL,
  snapshot    JSONB       NOT NULL,
  updated_at  BIGINT      NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  PRIMARY KEY (tenant_id, session_id)
);

CREATE TABLE IF NOT EXISTS ${s}.orchestration_mailbox_events (
  tenant_id   TEXT        NOT NULL,
  session_id  TEXT        NOT NULL,
  agent_id    TEXT        NOT NULL,
  seq         BIGSERIAL,
  event       JSONB       NOT NULL,
  PRIMARY KEY (tenant_id, session_id, agent_id, seq)
);

CREATE INDEX IF NOT EXISTS ${s}_mailbox_events_agent
  ON ${s}.orchestration_mailbox_events (tenant_id, session_id, agent_id, seq ASC);

CREATE TABLE IF NOT EXISTS ${s}.orchestration_mailbox_states (
  tenant_id   TEXT        NOT NULL,
  session_id  TEXT        NOT NULL,
  agent_id    TEXT        NOT NULL,
  state       JSONB       NOT NULL,
  updated_at  BIGINT      NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  PRIMARY KEY (tenant_id, session_id, agent_id)
);

CREATE TABLE IF NOT EXISTS ${s}.orchestration_agent_histories (
  tenant_id   TEXT        NOT NULL,
  session_id  TEXT        NOT NULL,
  agent_id    TEXT        NOT NULL,
  history     JSONB       NOT NULL,
  updated_at  BIGINT      NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  PRIMARY KEY (tenant_id, session_id, agent_id)
);
`;
}
