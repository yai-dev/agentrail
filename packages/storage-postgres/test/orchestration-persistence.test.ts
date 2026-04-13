/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { OrchestrationEvent } from "@agentrail/capabilities";
import { createSessionRef } from "@agentrail/core";
import { describe, expect, it } from "vitest";
import {
  PostgresOrchestrationPersistence,
  createPostgresOrchestrationPersistence,
} from "../src/orchestration-persistence.js";
import { usePgContainer } from "./helpers.js";

function makeSessionRef(id: string) {
  return createSessionRef("t1", id);
}

describe("PostgresOrchestrationPersistence", () => {
  const pg = usePgContainer();

  it("appendEvent / loadEvents round-trips in order", async () => {
    const p = new PostgresOrchestrationPersistence(pg.sql, makeSessionRef("orch-1"));

    const e1: OrchestrationEvent = {
      type: "run_started",
      runId: "run-1",
      occurredAt: new Date().toISOString(),
      eventId: "ev-1",
    } as unknown as OrchestrationEvent;

    const e2: OrchestrationEvent = {
      type: "agent_spawned",
      agentId: "ag-1",
      runId: "run-1",
      occurredAt: new Date().toISOString(),
      eventId: "ev-2",
    } as unknown as OrchestrationEvent;

    await p.appendEvent(e1);
    await p.appendEvent(e2);

    const events = await p.loadEvents();
    expect(events).toHaveLength(2);
    expect((events[0] as { eventId: string }).eventId).toBe("ev-1");
    expect((events[1] as { eventId: string }).eventId).toBe("ev-2");
  });

  it("loadSnapshot returns null when no snapshot written", async () => {
    const p = new PostgresOrchestrationPersistence(pg.sql, makeSessionRef("orch-snap-empty"));
    expect(await p.loadSnapshot()).toBeNull();
  });

  it("writeCheckpoint / loadSnapshot round-trips", async () => {
    const p = new PostgresOrchestrationPersistence(pg.sql, makeSessionRef("orch-snap-1"));
    const snap = {
      agents: {},
      runs: {},
      version: 1,
    } as unknown as import("@agentrail/capabilities").OrchestrationSnapshot;

    await p.writeCheckpoint(snap);
    const loaded = await p.loadSnapshot();
    expect(loaded).toMatchObject({ version: 1 });

    // Overwrite.
    await p.writeCheckpoint({
      ...snap,
      version: 2,
    } as unknown as import("@agentrail/capabilities").OrchestrationSnapshot);
    expect(((await p.loadSnapshot()) as { version: number }).version).toBe(2);
  });

  it("recoverState returns empty state when no data", async () => {
    const p = new PostgresOrchestrationPersistence(pg.sql, makeSessionRef("orch-recover-empty"));
    const state = await p.recoverState();
    expect(state).toBeDefined();
    expect(state.snapshot.agents).toBeDefined();
  });

  it("mailbox events — append / load round-trips", async () => {
    const p = new PostgresOrchestrationPersistence(pg.sql, makeSessionRef("orch-mailbox-1"));

    const event = {
      type: "input_received",
      agentId: "ag-x",
      inputId: "inp-1",
      occurredAt: new Date().toISOString(),
    } as unknown as import("@agentrail/capabilities").OrchestrationMailboxEvent;

    await p.appendMailboxEvent("ag-x", event);

    const events = await p.loadMailboxEvents("ag-x");
    expect(events).toHaveLength(1);
    expect((events[0] as { inputId: string }).inputId).toBe("inp-1");

    // Different agent's mailbox is empty.
    expect(await p.loadMailboxEvents("ag-other")).toHaveLength(0);
  });

  it("mailbox state — default and write/load round-trips", async () => {
    const p = new PostgresOrchestrationPersistence(pg.sql, makeSessionRef("orch-mbox-state"));

    const defaultState = await p.loadMailboxState("ag-z");
    expect(defaultState.processedEventCount).toBe(0);
    expect(defaultState.closeRequested).toBe(false);

    const newState = { processedEventCount: 3, closeRequested: true, pendingInputIds: ["i1"] };
    await p.writeMailboxState("ag-z", newState);

    const loaded = await p.loadMailboxState("ag-z");
    expect(loaded.processedEventCount).toBe(3);
    expect(loaded.closeRequested).toBe(true);
    expect(loaded.pendingInputIds).toEqual(["i1"]);
  });

  it("agent history — default empty and write/load round-trips", async () => {
    const p = new PostgresOrchestrationPersistence(pg.sql, makeSessionRef("orch-history-1"));

    expect(await p.loadAgentHistory("ag-h")).toEqual([]);

    const history = [
      { role: "user", content: "msg1" },
      { role: "assistant", content: "msg2" },
    ];
    await p.writeAgentHistory("ag-h", history);

    const loaded = await p.loadAgentHistory("ag-h");
    expect(loaded).toHaveLength(2);
    expect((loaded[0] as { content: string }).content).toBe("msg1");

    // Overwrite.
    await p.writeAgentHistory("ag-h", [history[0]!]);
    expect(await p.loadAgentHistory("ag-h")).toHaveLength(1);
  });

  it("createPostgresOrchestrationPersistence factory produces a working store", async () => {
    const factory = createPostgresOrchestrationPersistence(pg.sql);
    const p = factory(makeSessionRef("orch-factory-1"));

    expect(await p.loadEvents()).toHaveLength(0);
    expect(await p.recoverState()).toBeDefined();
  });

  it("different sessions are isolated", async () => {
    const pA = new PostgresOrchestrationPersistence(pg.sql, makeSessionRef("orch-iso-a"));
    const pB = new PostgresOrchestrationPersistence(pg.sql, makeSessionRef("orch-iso-b"));

    await pA.appendEvent({
      type: "run_started",
      eventId: "e-iso",
    } as unknown as OrchestrationEvent);

    expect(await pA.loadEvents()).toHaveLength(1);
    expect(await pB.loadEvents()).toHaveLength(0);
  });
});
