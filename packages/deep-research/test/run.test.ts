/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createSessionRef } from "@agentrail/core";
import { describe, expect, it, vi } from "vitest";
import type { DeepResearchState } from "../src/index.js";
import { createDeepResearchRunRoute, runDeepResearchBlocking } from "../src/run.js";

vi.mock("../src/coordinator.js", () => {
  class MockDeepResearchCoordinator {
    constructor(private readonly input: { query: string; sessionId: string }) {}

    async runBlocking(): Promise<DeepResearchState> {
      return {
        run: {
          id: "run-1",
          sessionId: this.input.sessionId,
          tenantId: "tenant-1",
          userId: "user-1",
          query: this.input.query,
          title: this.input.query,
          status: "completed",
          createdAt: "2026-03-29T00:00:00.000Z",
          updatedAt: "2026-03-29T00:00:00.000Z",
          completedAt: "2026-03-29T00:00:01.000Z",
        },
        plan: null,
        steps: [],
        sources: [],
        artifacts: [],
        reportMarkdown: `Report for ${this.input.query}`,
      };
    }
  }

  return {
    DeepResearchCoordinator: MockDeepResearchCoordinator,
  };
});

function createSessionStore() {
  return {
    getOrCreate: vi.fn(async () => ({
      sessionId: "session-1",
      sessionRef: createSessionRef("tenant-1", "session-1"),
    })),
    loadMessages: vi.fn(async () => []),
    appendMessages: vi.fn(async () => {}),
    recordTurn: vi.fn(async () => {}),
  };
}

describe("runDeepResearchBlocking", () => {
  it("runs the coordinator and persists the generated report to session history", async () => {
    const sessionStore = createSessionStore();

    const result = await runDeepResearchBlocking({
      tenantId: "tenant-1",
      userId: "user-1",
      query: "Compare models",
      sessionStore,
      runtime: {
        dataDir: "/tmp/agentrail",
        model: {
          provider: "mock",
          modelId: "mock-model",
        },
      },
    });

    expect(result.sessionId).toBe("session-1");
    expect(result.state.run.id).toBe("run-1");
    expect(sessionStore.appendMessages).toHaveBeenCalledOnce();
    expect(sessionStore.recordTurn).toHaveBeenCalledOnce();
  });
});

describe("createDeepResearchRunRoute", () => {
  it("validates requests and returns the blocking run response", async () => {
    const sessionStore = createSessionStore();
    const route = createDeepResearchRunRoute({
      sessionStore,
      runtime: {
        dataDir: "/tmp/agentrail",
        model: {
          provider: "mock",
          modelId: "mock-model",
        },
      },
    });

    const response = await route.request("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: "Compare models",
        tenantId: "tenant-1",
        userId: "user-1",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sessionId: "session-1",
      runId: "run-1",
    });
  });
});
