/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createSessionRef } from "@agentrail/core";
import { describe, expect, it } from "vitest";
import { PostgresSessionTraceStore, createPostgresSessionTraceStore } from "../src/trace-store.js";
import { usePgContainer } from "./helpers.js";

describe("PostgresSessionTraceStore", () => {
  const pg = usePgContainer();

  it("appendEnvelope / loadEnvelopes round-trips in insertion order", async () => {
    const sessionRef = createSessionRef("t1", "sess-trace-1");
    const store = new PostgresSessionTraceStore(pg.sql, sessionRef);

    const e1 = {
      id: "e1",
      timestamp: "2026-01-01T00:00:00Z",
      sequence: 0,
      source: "runtime",
      event: { type: "turn_start" },
    };
    const e2 = {
      id: "e2",
      timestamp: "2026-01-01T00:00:01Z",
      sequence: 1,
      source: "runtime",
      event: { type: "turn_end" },
    };

    await store.appendEnvelope(e1);
    await store.appendEnvelope(e2);

    const loaded = await store.loadEnvelopes();
    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toMatchObject({ id: "e1" });
    expect(loaded[1]).toMatchObject({ id: "e2" });
  });

  it("loadEnvelopes returns empty array when no envelopes exist", async () => {
    const sessionRef = createSessionRef("t1", "sess-trace-empty");
    const store = new PostgresSessionTraceStore(pg.sql, sessionRef);
    const loaded = await store.loadEnvelopes();
    expect(loaded).toHaveLength(0);
  });

  it("createPostgresSessionTraceStore factory produces a working store", async () => {
    const factory = createPostgresSessionTraceStore(pg.sql);
    const sessionRef = createSessionRef("t1", "sess-trace-factory");
    const store = factory(sessionRef);

    await store.appendEnvelope({
      id: "factory-e1",
      timestamp: new Date().toISOString(),
      sequence: 0,
      source: "runtime",
      event: { type: "ping" },
    });
    const loaded = await store.loadEnvelopes();
    expect(loaded).toHaveLength(1);
  });

  it("different sessions are isolated", async () => {
    const ref1 = createSessionRef("t1", "trace-iso-a");
    const ref2 = createSessionRef("t1", "trace-iso-b");

    const storeA = new PostgresSessionTraceStore(pg.sql, ref1);
    const storeB = new PostgresSessionTraceStore(pg.sql, ref2);

    await storeA.appendEnvelope({
      id: "a-only",
      timestamp: new Date().toISOString(),
      sequence: 0,
      source: "runtime",
      event: {},
    });

    expect(await storeA.loadEnvelopes()).toHaveLength(1);
    expect(await storeB.loadEnvelopes()).toHaveLength(0);
  });
});
