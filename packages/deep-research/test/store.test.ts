/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { DeepResearchStore } from "../src/store.js";
import type { DeepResearchState } from "../src/types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createSessionDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agentrail-deep-research-"));
  tempDirs.push(dir);
  return join(dir, "tenants", "default", "sessions", "session-1");
}

function createState(runId: string): DeepResearchState {
  return {
    run: {
      id: runId,
      sessionId: "session-1",
      tenantId: "default",
      userId: "user-1",
      query: "Compare agent runtimes",
      title: "Compare agent runtimes",
      status: "running",
      createdAt: "2026-03-27T10:00:00.000Z",
      updatedAt: "2026-03-27T10:00:00.000Z",
    },
    plan: null,
    steps: [],
    sources: [],
    artifacts: [],
    reportMarkdown: "",
  };
}

describe("DeepResearchStore", () => {
  it("persists and reloads state plus events", async () => {
    const sessionDir = await createSessionDir();
    const store = new DeepResearchStore(sessionDir);
    const state = createState("run-1");

    await store.initializeRun(state);
    await store.appendEvent(state.run.id, {
      type: "deep_research_start",
      run: state.run,
      timestamp: "2026-03-27T10:00:00.000Z",
    });

    await expect(store.loadState("run-1")).resolves.toEqual(state);
    await expect(store.loadEvents("run-1")).resolves.toEqual([
      {
        type: "deep_research_start",
        run: state.run,
        timestamp: "2026-03-27T10:00:00.000Z",
      },
    ]);
  });

  it("tracks the latest run", async () => {
    const sessionDir = await createSessionDir();
    const store = new DeepResearchStore(sessionDir);
    const first = createState("run-1");
    const second = createState("run-2");
    second.run.updatedAt = "2026-03-27T11:00:00.000Z";

    await store.initializeRun(first);
    await store.writeState(second);

    await expect(store.loadLatestState()).resolves.toEqual(second);
  });
});
