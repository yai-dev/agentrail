/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/**
 * Regression tests for /chat telemetry event filtering.
 *
 * Previously agent_start and agent_end were not in TRACE_PERSISTED_EVENT_TYPES,
 * so a telemetrySink on /chat would only ever receive error events. These tests
 * wire createChatRoute with a real onTraceEvent observer and verify that the
 * synthetic lifecycle events are delivered correctly.
 */

import { describe, it, expect, vi } from "vitest";
import { createChatRoute } from "../src/routes/chat-route.js";
import type { WorkflowTraceEventEnvelope } from "../src/events/index.js";
import type { AgentrailSessionStore, AgentrailProfile } from "../src/host/types.js";

// ─── Minimal stubs ────────────────────────────────────────────────────────────

const SESSION_ID = "test-session";
const TENANT_ID = "tenant-1";
const USER_ID = "user-1";
const AGENT_ID = "test-agent";

function makeSessionStore(): AgentrailSessionStore {
  return {
    getOrCreate: vi.fn().mockResolvedValue({
      sessionId: SESSION_ID,
      sessionRef: `${TENANT_ID}:${SESSION_ID}`,
    }),
    loadMessages: vi.fn().mockResolvedValue([]),
    loadMessagesWithBudget: vi.fn().mockResolvedValue([]),
    loadAllMessages: vi.fn().mockResolvedValue([]),
    appendMessages: vi.fn().mockResolvedValue(undefined),
    recordTurn: vi.fn().mockResolvedValue(undefined),
    compactIfNeeded: vi.fn().mockResolvedValue(false),
    ping: vi.fn().mockResolvedValue(undefined),
  };
}

function makeProfile(agentId = AGENT_ID): AgentrailProfile {
  return {
    id: agentId,
    name: agentId,
    createAgent: vi.fn().mockResolvedValue({
      invoke: vi.fn().mockResolvedValue({
        text: "hello",
        messages: [],
        usage: { inputTokens: 10, outputTokens: 5 },
        stopReason: "end_turn",
      }),
    }),
    getContextProviders: vi.fn().mockResolvedValue([]),
  } as unknown as AgentrailProfile;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("createChatRoute – telemetry event filtering", () => {
  it("delivers agent_start and agent_end to onTraceEvent", async () => {
    const collected: WorkflowTraceEventEnvelope[] = [];
    const profile = makeProfile();

    const route = createChatRoute({
      defaultAgentId: AGENT_ID,
      sessionStore: makeSessionStore(),
      summarize: async () => "",
      compaction: { triggerTokens: 999_999, minMessages: 9999 },
      resolveProfile: vi.fn().mockResolvedValue(profile),
      onTraceEvent: (_ctx, envelope) => collected.push(envelope),
    });

    const req = new Request("http://localhost/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: TENANT_ID,
        userId: USER_ID,
        agentId: AGENT_ID,
        message: "ping",
      }),
    });

    const res = await route.fetch(req);
    expect(res.status).toBe(200);

    const eventTypes = collected.map((e) => e.event["type"]);
    expect(eventTypes).toContain("agent_start");
    expect(eventTypes).toContain("agent_end");
  });

  it("all envelopes from the same request share one traceId", async () => {
    const collected: WorkflowTraceEventEnvelope[] = [];
    const profile = makeProfile();

    const route = createChatRoute({
      defaultAgentId: AGENT_ID,
      sessionStore: makeSessionStore(),
      summarize: async () => "",
      compaction: { triggerTokens: 999_999, minMessages: 9999 },
      resolveProfile: vi.fn().mockResolvedValue(profile),
      onTraceEvent: (_ctx, envelope) => collected.push(envelope),
    });

    const req = new Request("http://localhost/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: TENANT_ID,
        userId: USER_ID,
        agentId: AGENT_ID,
        message: "ping",
      }),
    });

    await route.fetch(req);

    expect(collected.length).toBeGreaterThanOrEqual(2);
    const traceIds = new Set(collected.map((e) => e.traceId));
    expect(traceIds.size).toBe(1);
    expect([...traceIds][0]).toBeDefined();
  });

  it("each envelope has a unique id even though traceId is shared", async () => {
    const collected: WorkflowTraceEventEnvelope[] = [];
    const profile = makeProfile();

    const route = createChatRoute({
      defaultAgentId: AGENT_ID,
      sessionStore: makeSessionStore(),
      summarize: async () => "",
      compaction: { triggerTokens: 999_999, minMessages: 9999 },
      resolveProfile: vi.fn().mockResolvedValue(profile),
      onTraceEvent: (_ctx, envelope) => collected.push(envelope),
    });

    const req = new Request("http://localhost/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: TENANT_ID,
        userId: USER_ID,
        agentId: AGENT_ID,
        message: "ping",
      }),
    });

    await route.fetch(req);

    const ids = collected.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
