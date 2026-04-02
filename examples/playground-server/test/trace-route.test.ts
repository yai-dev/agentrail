/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { WorkflowTraceEventEnvelope } from "@agentrail/events";
import { createFileSystemSessionTraceStore, createSessionRef } from "@agentrail/memo";
import { createFilesystemOrchestrationPersistence } from "@agentrail/orchestration";
import { Hono } from "hono";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDir = await mkdtemp(join(tmpdir(), "agentrail-trace-route-"));
const configPath = join(dataDir, "agentrail.yaml");
await writeFile(configPath, `version: 1\npaths:\n  dataDir: ${JSON.stringify(dataDir)}\n`, "utf8");
process.env.AGENTRAIL_CONFIG_PATH = configPath;
const { trace } = await import("../src/routes/trace.js");

after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.AGENTRAIL_CONFIG_PATH;
});

test("trace route returns merged runtime and orchestration events", async () => {
  const tenantId = "default";
  const sessionId = "session-trace-route";
  const sessionRef = createSessionRef(tenantId, sessionId);
  const traceStore = createFileSystemSessionTraceStore<WorkflowTraceEventEnvelope>(
    dataDir,
    sessionRef,
  );
  const persistence = createFilesystemOrchestrationPersistence(dataDir, sessionRef);

  await traceStore.appendEnvelope({
    id: "runtime-1",
    timestamp: "2026-03-30T10:00:00.000Z",
    sequence: 0,
    source: "runtime",
    event: {
      type: "agent_start",
    },
  });
  await persistence.appendEvent({
    eventId: "evt-trace-route-1",
    type: "run_started",
    occurredAt: "2026-03-30T10:00:01.000Z",
    runId: "run-trace-route",
    initialTask: {
      id: "task-trace-route",
      kind: "trace-route",
      input: {
        prompt: "Merge trace streams",
      },
    },
  });

  const app = new Hono();
  app.route("/api/sessions", trace);

  const response = await app.request(`/api/sessions/${sessionId}/trace?tenantId=${tenantId}`);

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    events: WorkflowTraceEventEnvelope[];
  };

  assert.equal(payload.events.length, 2);
  assert.equal(payload.events[0]?.source, "runtime");
  assert.equal(payload.events[1]?.source, "orchestration");
  assert.equal(payload.events[1]?.event.type, "orchestration_run_start");
});
