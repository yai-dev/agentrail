/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, it, expect, vi } from "vitest";
import { createAgentApp } from "../src/app/create-agent-app.js";
import type { AgentrailSessionStore } from "@agentrail/core";

// Minimal profile definition that satisfies createAgentApp type checks.
const minimalProfile = {
  id: "test",
  name: "Test",
  createAgent: vi.fn().mockResolvedValue({}),
  getContextProviders: vi.fn().mockResolvedValue([]),
};

// Minimal custom session store stub — only the shape matters for guard tests.
const customStore: AgentrailSessionStore = {
  getOrCreate: vi.fn().mockResolvedValue({
    sessionId: "s1",
    sessionRef: "t:s1",
    isNew: false,
  }),
  appendMessages: vi.fn().mockResolvedValue(undefined),
  getMessages: vi.fn().mockResolvedValue([]),
  recordTurn: vi.fn().mockResolvedValue(undefined),
  getSession: vi.fn().mockResolvedValue(undefined),
  ping: vi.fn().mockResolvedValue(undefined),
};

describe("createAgentApp – Inspector startup guards", () => {
  it("throws when inspector is enabled without dataDir", () => {
    expect(() =>
      createAgentApp({
        sessionStore: customStore,
        profiles: [minimalProfile as never],
        inspector: true,
      }),
    ).toThrow(/inspector.*dataDir/i);
  });

  it("throws when inspector is enabled alongside a custom sessionStore", () => {
    expect(() =>
      createAgentApp({
        dataDir: "/tmp/test-data",
        sessionStore: customStore,
        profiles: [minimalProfile as never],
        inspector: true,
      }),
    ).toThrow(/inspector.*sessionStore|sessionStore.*inspector/i);
  });

  it("does not throw when inspector is enabled with only dataDir", () => {
    expect(() =>
      createAgentApp({
        dataDir: "/tmp/test-data",
        profiles: [minimalProfile as never],
        inspector: true,
      }),
    ).not.toThrow();
  });

  it("does not mount inspector when flag is absent", () => {
    const app = createAgentApp({
      dataDir: "/tmp/test-data",
      profiles: [minimalProfile as never],
    });
    // Hono app should be returned without error
    expect(app).toBeTruthy();
  });
});
