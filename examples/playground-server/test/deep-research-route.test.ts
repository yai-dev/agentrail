/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import {
  createFileSystemDeepResearchStore,
  type DeepResearchState,
} from "@agentrail/deep-research";
import { createSessionRef } from "@agentrail/core";
import { Hono } from "hono";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDir = await mkdtemp(join(tmpdir(), "agentrail-deep-research-route-"));
const configPath = join(dataDir, "agentrail.yaml");
await writeFile(configPath, `version: 1\npaths:\n  dataDir: ${JSON.stringify(dataDir)}\n`, "utf8");
process.env.AGENTRAIL_CONFIG_PATH = configPath;
const { deepResearch } = await import("../src/routes/deep-research.js");

after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.AGENTRAIL_CONFIG_PATH;
});

test("deep research route returns latest run state and events", async () => {
  const sessionId = "session-deep-research-route";
  const store = createFileSystemDeepResearchStore(dataDir, createSessionRef("default", sessionId));

  const state: DeepResearchState = {
    run: {
      id: "run-test-1",
      sessionId,
      tenantId: "default",
      userId: "user-1",
      query: "Compare AI coding agents",
      title: "Compare AI coding agents",
      status: "running",
      createdAt: "2026-03-27T10:00:00.000Z",
      updatedAt: "2026-03-27T10:00:00.000Z",
    },
    plan: {
      title: "Compare AI coding agents",
      steps: [
        {
          type: "research",
          title: "Gather external sources",
          description: "Search for external sources",
        },
      ],
    },
    steps: [
      {
        id: "step-1",
        index: 0,
        type: "research",
        title: "Gather external sources",
        description: "Search for external sources",
        status: "completed",
        summary: "Collected sources",
      },
    ],
    sources: [],
    artifacts: [],
    reportMarkdown: "",
  };

  await store.initializeRun(state);
  await store.appendEvent(state.run.id, {
    type: "deep_research_start",
    run: state.run,
    timestamp: "2026-03-27T10:00:00.000Z",
  });

  const app = new Hono();
  app.route("/api/sessions", deepResearch);

  const response = await app.request(`/api/sessions/${sessionId}/deep-research?tenantId=default`);

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    state?: DeepResearchState | null;
    events?: Array<{ type: string }>;
  };

  assert.equal(payload.state?.run.id, "run-test-1");
  assert.equal(payload.state?.steps[0]?.summary, "Collected sources");
  assert.equal(payload.events?.[0]?.type, "deep_research_start");
});

test("deep research artifact route streams raw artifact bytes", async () => {
  const sessionId = "session-deep-research-artifact";
  const hostArtifactPath = join(
    dataDir,
    "sandboxes",
    sessionId,
    ".deep-research",
    "artifacts",
    "chart.svg",
  );

  await mkdir(join(dataDir, "sandboxes", sessionId, ".deep-research", "artifacts"), {
    recursive: true,
  });
  await writeFile(hostArtifactPath, '<svg xmlns="http://www.w3.org/2000/svg"></svg>', "utf-8");

  const app = new Hono();
  app.route("/api/sessions", deepResearch);

  const response = await app.request(
    `/api/sessions/${sessionId}/deep-research/artifact?path=${encodeURIComponent(
      "/workspace/.deep-research/artifacts/chart.svg",
    )}`,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/svg+xml");
  assert.match(await response.text(), /<svg/);
});
