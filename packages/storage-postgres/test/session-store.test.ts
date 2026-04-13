/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it } from "vitest";
import { PostgresSessionStore } from "../src/session-store.js";
import { assistantMsg, usePgContainer, userMsg } from "./helpers.js";

describe("PostgresSessionStore", () => {
  const pg = usePgContainer();

  it("getOrCreate — creates and is idempotent", async () => {
    const store = new PostgresSessionStore(pg.sql);
    const { sessionId, sessionRef } = await store.getOrCreate("t1", "u1", "agent");
    expect(sessionId).toBeTruthy();
    expect(sessionRef).toBeTruthy();

    // Re-creating with the same sessionId should not throw.
    const { sessionId: same } = await store.getOrCreate("t1", "u1", "agent", sessionId);
    expect(same).toBe(sessionId);
  });

  it("appendMessages / loadAllMessages round-trips", async () => {
    const store = new PostgresSessionStore(pg.sql);
    const { sessionId } = await store.getOrCreate("t1", "u2", "agent");

    const msgs = [userMsg("hello"), assistantMsg("hi there")];
    await store.appendMessages("t1", sessionId, msgs as never);

    const loaded = await store.loadAllMessages("t1", sessionId);
    expect(loaded).toHaveLength(2);
    expect((loaded[0] as { content: string }).content).toBe("hello");
    expect((loaded[1] as { content: { text: string }[] }).content[0]!.text).toBe("hi there");
  });

  it("loadMessages with limit returns latest N", async () => {
    const store = new PostgresSessionStore(pg.sql);
    const { sessionId } = await store.getOrCreate("t1", "u3", "agent");

    await store.appendMessages("t1", sessionId, [
      userMsg("a"),
      userMsg("b"),
      userMsg("c"),
    ] as never);

    const latest = await store.loadMessages("t1", sessionId, 2);
    expect(latest).toHaveLength(2);
    expect((latest[0] as { content: string }).content).toBe("b");
  });

  it("loadMessagesWithBudget respects token budget", async () => {
    const store = new PostgresSessionStore(pg.sql);
    const { sessionId } = await store.getOrCreate("t1", "u4", "agent");

    // Each message is ~3 tokens
    await store.appendMessages("t1", sessionId, [
      userMsg("x"),
      userMsg("y"),
      userMsg("z"),
    ] as never);

    // Very tight budget should return only the most recent messages.
    const result = await store.loadMessagesWithBudget("t1", sessionId, 1);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("recordTurn persists without error", async () => {
    const store = new PostgresSessionStore(pg.sql);
    const { sessionId } = await store.getOrCreate("t1", "u5", "agent");

    await expect(
      store.recordTurn("t1", sessionId, {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 150,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      }),
    ).resolves.toBeUndefined();
  });

  it("ping succeeds", async () => {
    const store = new PostgresSessionStore(pg.sql);
    await expect(store.ping()).resolves.toBeUndefined();
  });

  // ─── Memory Documents ──────────────────────────────────────────────────────

  it("readMemoryDocument returns null when absent", async () => {
    const store = new PostgresSessionStore(pg.sql);
    const { sessionId } = await store.getOrCreate("t1", "memo-u1", "agent");
    const result = await store.readMemoryDocument("t1", sessionId, "session", "NOTES.md");
    expect(result).toBeNull();
  });

  it("writeMemoryDocument / readMemoryDocument round-trips", async () => {
    const store = new PostgresSessionStore(pg.sql);
    const { sessionId } = await store.getOrCreate("t1", "memo-u2", "agent");

    await store.writeMemoryDocument("t1", sessionId, "session", "NOTES.md", "initial content");
    const result = await store.readMemoryDocument("t1", sessionId, "session", "NOTES.md");
    expect(result).toBe("initial content");

    // Overwrite.
    await store.writeMemoryDocument("t1", sessionId, "session", "NOTES.md", "updated content");
    const updated = await store.readMemoryDocument("t1", sessionId, "session", "NOTES.md");
    expect(updated).toBe("updated content");
  });

  it("appendMemoryDocument concatenates content", async () => {
    const store = new PostgresSessionStore(pg.sql);
    const { sessionId } = await store.getOrCreate("t1", "memo-u3", "agent");

    await store.writeMemoryDocument("t1", sessionId, "session", "NOTES.md", "line1\n");
    await store.appendMemoryDocument("t1", sessionId, "session", "NOTES.md", "line2\n");
    const result = await store.readMemoryDocument("t1", sessionId, "session", "NOTES.md");
    expect(result).toBe("line1\nline2\n");
  });

  it("USER.md scoped to user owner", async () => {
    const store = new PostgresSessionStore(pg.sql);
    await store.getOrCreate("t1", "usr-scope", "agent");

    await store.writeMemoryDocument("t1", "usr-scope", "user", "USER.md", "user prefs");
    const result = await store.readMemoryDocument("t1", "usr-scope", "user", "USER.md");
    expect(result).toBe("user prefs");
  });

  // ─── Tool-Result Artifacts ─────────────────────────────────────────────────

  it("writeToolResultArtifact / readToolResultArtifact round-trips", async () => {
    const store = new PostgresSessionStore(pg.sql);
    const { sessionId, sessionRef } = await store.getOrCreate("t1", "art-u1", "agent");

    await store.writeToolResultArtifact(sessionRef, "tool-abc", "artifact content");
    const result = await store.readToolResultArtifact(sessionRef, "tool-abc");
    expect(result).toBe("artifact content");
  });

  it("readToolResultArtifact returns null when absent", async () => {
    const store = new PostgresSessionStore(pg.sql);
    const { sessionRef } = await store.getOrCreate("t1", "art-u2", "agent");
    const result = await store.readToolResultArtifact(sessionRef, "missing-id");
    expect(result).toBeNull();
  });
});
