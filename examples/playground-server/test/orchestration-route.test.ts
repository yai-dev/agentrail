/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createFilesystemOrchestrationPersistence } from "@agentrail/capabilities";
import { createSessionRef } from "@agentrail/core";
import { Hono } from "hono";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("orchestration route exposes mailbox progress and last job state", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "agentrail-orchestration-route-"));
  const configPath = join(dataDir, "agentrail.yaml");
  await writeFile(
    configPath,
    `version: 1\npaths:\n  dataDir: ${JSON.stringify(dataDir)}\n`,
    "utf8",
  );
  process.env.AGENTRAIL_CONFIG_PATH = configPath;

  const sessionId = "session-route-test";
  const persistence = createFilesystemOrchestrationPersistence(
    dataDir,
    createSessionRef("default", sessionId),
  );

  try {
    await persistence.appendEvent({
      eventId: "evt-route-1",
      type: "run_started",
      occurredAt: "2026-03-23T13:00:00.000Z",
      runId: "run-route-test",
      initialTask: {
        id: "task-route-test",
        kind: "route-test",
        input: {
          prompt: "Expose orchestration metadata",
        },
      },
    });
    await persistence.appendEvent({
      eventId: "evt-route-2",
      type: "agent_spawned",
      occurredAt: "2026-03-23T13:00:01.000Z",
      runId: "run-route-test",
      agent: {
        id: "agent-route-test",
        runId: "run-route-test",
        displayName: "Nova",
        taskId: "task-route-test",
        role: "worker",
      },
    });
    await persistence.appendEvent({
      eventId: "evt-route-3",
      type: "agent_job_completed",
      occurredAt: "2026-03-23T13:00:02.000Z",
      runId: "run-route-test",
      agentId: "agent-route-test",
      job: {
        jobId: "job-route-test",
        inputIds: ["input-route-test"],
        outcome: "completed",
        outputText: "done",
      },
    });
    await persistence.writeMailboxState("agent-route-test", {
      processedEventCount: 2,
      closeRequested: {
        occurredAt: "2026-03-23T13:00:03.000Z",
        reason: "shutdown",
      },
    });

    const { orchestration } = await import("../src/routes/orchestration.js");
    const app = new Hono();
    app.route("/api/sessions", orchestration);

    const response = await app.request(`/api/sessions/${sessionId}/orchestration?tenantId=default`);

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      agents: Array<{
        displayName?: string;
        lastJob?: {
          jobId: string;
          outcome: string;
        };
        mailbox?: {
          processedEventCount?: number;
          closeRequested?: {
            occurredAt: string;
            reason?: string;
          } | null;
        };
      }>;
    };

    assert.equal(payload.agents.length, 1);
    assert.equal(payload.agents[0]?.displayName, "Nova");
    assert.deepEqual(payload.agents[0]?.lastJob, {
      jobId: "job-route-test",
      inputIds: ["input-route-test"],
      outcome: "completed",
      outputText: "done",
      completedAt: "2026-03-23T13:00:02.000Z",
    });
    assert.equal(payload.agents[0]?.mailbox?.processedEventCount, 2);
    assert.deepEqual(payload.agents[0]?.mailbox?.closeRequested, {
      occurredAt: "2026-03-23T13:00:03.000Z",
      reason: "shutdown",
    });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
    delete process.env.AGENTRAIL_CONFIG_PATH;
  }
});
