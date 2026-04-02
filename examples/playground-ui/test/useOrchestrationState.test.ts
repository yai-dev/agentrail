/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import assert from "node:assert/strict";
import test from "node:test";
import { applyEventToStateForTest } from "../src/hooks/orchestrationStateReducer.js";
import type { OrchestrationState, OrchestrationStreamEvent } from "../src/types/orchestration.js";

test("applyEventToState tracks closing and job lifecycle data", () => {
  const initial: OrchestrationState = {
    run: {
      id: "run-ui-test",
      status: "running",
      createdAt: "2026-03-23T21:00:00.000Z",
      updatedAt: "2026-03-23T21:00:00.000Z",
    },
    agents: [
      {
        id: "agent-ui-test",
        role: "worker",
        status: "idle",
        createdAt: "2026-03-23T21:00:01.000Z",
        updatedAt: "2026-03-23T21:00:01.000Z",
      },
    ],
    waits: [],
    events: [],
  };

  const events: OrchestrationStreamEvent[] = [
    {
      type: "subagent_status",
      agentId: "agent-ui-test",
      status: "closing",
      timestamp: "2026-03-23T21:00:02.000Z",
    },
    {
      type: "subagent_job_started",
      agentId: "agent-ui-test",
      jobId: "job-ui-test",
      inputIds: ["input-ui-test"],
      timestamp: "2026-03-23T21:00:03.000Z",
    },
    {
      type: "subagent_job_completed",
      agentId: "agent-ui-test",
      job: {
        jobId: "job-ui-test",
        inputIds: ["input-ui-test"],
        outcome: "completed",
        outputText: "done",
      },
      timestamp: "2026-03-23T21:00:04.000Z",
    },
  ];

  const finalState = events.reduce(
    (state, event) => applyEventToStateForTest(state, event),
    initial,
  );

  assert.equal(finalState.agents[0]?.status, "closing");
  assert.deepEqual(finalState.agents[0]?.activeJob, {
    jobId: "job-ui-test",
    inputIds: ["input-ui-test"],
    startedAt: "2026-03-23T21:00:03.000Z",
  });
  assert.deepEqual(finalState.agents[0]?.lastJob, {
    jobId: "job-ui-test",
    inputIds: ["input-ui-test"],
    outcome: "completed",
    outputText: "done",
    completedAt: "2026-03-23T21:00:04.000Z",
  });
  assert.equal(finalState.events.length, 3);
});

test("applyEventToState clears activeJob once the agent becomes idle", () => {
  const initial: OrchestrationState = {
    run: null,
    agents: [
      {
        id: "agent-ui-idle",
        role: "worker",
        status: "running",
        createdAt: "2026-03-23T21:10:00.000Z",
        updatedAt: "2026-03-23T21:10:00.000Z",
        activeJob: {
          jobId: "job-ui-idle",
          inputIds: ["input-ui-idle"],
          startedAt: "2026-03-23T21:10:01.000Z",
        },
      },
    ],
    waits: [],
    events: [],
  };

  const finalState = applyEventToStateForTest(initial, {
    type: "subagent_status",
    agentId: "agent-ui-idle",
    status: "idle",
    timestamp: "2026-03-23T21:10:02.000Z",
  });

  assert.equal(finalState.agents[0]?.status, "idle");
  assert.equal(finalState.agents[0]?.activeJob, undefined);
});

test("applyEventToState stores sub-agent display names from spawn events", () => {
  const initial: OrchestrationState = {
    run: null,
    agents: [],
    waits: [],
    events: [],
  };

  const finalState = applyEventToStateForTest(initial, {
    type: "subagent_spawned",
    agent: {
      id: "agent-ui-name",
      displayName: "Nova",
      role: "researcher",
      status: "idle",
      createdAt: "2026-03-23T21:20:00.000Z",
    },
    timestamp: "2026-03-23T21:20:00.000Z",
  });

  assert.equal(finalState.agents[0]?.displayName, "Nova");
  assert.equal(finalState.agents[0]?.role, "researcher");
});
