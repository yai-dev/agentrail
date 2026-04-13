/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it } from "vitest";
import { PostgresInspectorDataSource } from "../src/inspector-data-source.js";
import { PostgresOrchestrationPersistence } from "../src/orchestration-persistence.js";
import { PostgresSessionStore } from "../src/session-store.js";
import { PostgresSessionTraceStore } from "../src/trace-store.js";
import { assistantMsg, usePgContainer, userMsg } from "./helpers.js";

describe("PostgresInspectorDataSource", () => {
  const pg = usePgContainer();

  async function seedSession(tenantId: string, userId: string) {
    const store = new PostgresSessionStore(pg.sql);
    const { sessionId, sessionRef } = await store.getOrCreate(tenantId, userId, "agent");

    // Append a couple of messages.
    await store.appendMessages(tenantId, sessionId, [
      userMsg("hello"),
      assistantMsg("hi"),
    ] as never);

    // Record a turn.
    await store.recordTurn(tenantId, sessionId, {
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 15,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    });

    // Append a trace envelope.
    const traceStore = new PostgresSessionTraceStore(pg.sql, sessionRef);
    await traceStore.appendEnvelope({
      id: "env-1",
      timestamp: new Date().toISOString(),
      sequence: 0,
      source: "runtime",
      event: { type: "turn_end" },
    });

    return { sessionId, sessionRef };
  }

  it("listSessions returns seeded sessions", async () => {
    const { sessionId } = await seedSession("insp-t1", "insp-u1");
    const ds = new PostgresInspectorDataSource(pg.sql);

    const sessions = await ds.listSessions();
    const found = sessions.find((s) => s.sessionId === sessionId);
    expect(found).toBeDefined();
    expect(found!.tenantId).toBe("insp-t1");
    expect(found!.userId).toBe("insp-u1");
  });

  it("listSessions returns turn count from session_turns", async () => {
    const { sessionId } = await seedSession("insp-t2", "insp-u2");
    const ds = new PostgresInspectorDataSource(pg.sql);

    const sessions = await ds.listSessions();
    const found = sessions.find((s) => s.sessionId === sessionId);
    expect(found!.turns).toBe(1);
  });

  it("loadMessages returns messages in order", async () => {
    const { sessionId } = await seedSession("insp-t3", "insp-u3");
    const ds = new PostgresInspectorDataSource(pg.sql);

    const messages = await ds.loadMessages("insp-t3", sessionId);
    expect(messages).toHaveLength(2);
    expect((messages[0] as { content: string }).content).toBe("hello");
  });

  it("loadMessages returns empty for unknown session", async () => {
    const ds = new PostgresInspectorDataSource(pg.sql);
    const msgs = await ds.loadMessages("insp-t3", "no-such-session");
    expect(msgs).toHaveLength(0);
  });

  it("loadTraceEnvelopes returns envelopes in order", async () => {
    const { sessionId } = await seedSession("insp-t4", "insp-u4");
    const ds = new PostgresInspectorDataSource(pg.sql);

    const envelopes = await ds.loadTraceEnvelopes("insp-t4", sessionId);
    expect(envelopes.length).toBeGreaterThanOrEqual(1);
    expect((envelopes[0] as { id: string }).id).toBe("env-1");
  });

  it("loadOrchestrationState returns null when no events or snapshot", async () => {
    const ds = new PostgresInspectorDataSource(pg.sql);
    const state = await ds.loadOrchestrationState("insp-t5", "no-orch-session");
    expect(state).toBeNull();
  });

  it("loadOrchestrationState returns non-null when a snapshot is stored", async () => {
    const { sessionId, sessionRef } = await seedSession("insp-t6", "insp-u6");
    const p = new PostgresOrchestrationPersistence(pg.sql, sessionRef);

    // Use recoverState to get a valid empty snapshot, then checkpoint it.
    const emptyState = await p.recoverState();
    await p.writeCheckpoint(emptyState.snapshot);

    const ds = new PostgresInspectorDataSource(pg.sql);
    const state = await ds.loadOrchestrationState("insp-t6", sessionId);
    expect(state).not.toBeNull();
    expect(state!.snapshot).toBeDefined();
  });

  it("loadOrchestrationEvents returns raw events", async () => {
    const { sessionId, sessionRef } = await seedSession("insp-t7", "insp-u7");
    const p = new PostgresOrchestrationPersistence(pg.sql, sessionRef);

    await p.appendEvent({
      type: "run_started",
      eventId: "ev-raw-1",
      runId: "run-y",
      occurredAt: new Date().toISOString(),
    } as never);

    const ds = new PostgresInspectorDataSource(pg.sql);
    const events = await ds.loadOrchestrationEvents("insp-t7", sessionId);
    expect(events).toHaveLength(1);
    expect((events[0] as { eventId: string }).eventId).toBe("ev-raw-1");
  });
});
