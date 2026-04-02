/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { OrchestrationEvent } from "@agentrail/orchestration";
import { describe, expect, it } from "vitest";
import { mapOrchestrationEvent } from "../src/index.js";

describe("mapOrchestrationEvent", () => {
  it("maps run_started into an Agentrail host event", () => {
    const event: OrchestrationEvent = {
      eventId: "evt-1",
      occurredAt: "2026-03-29T00:00:00.000Z",
      runId: "run-1",
      type: "run_started",
      initialTask: {
        id: "task-1",
        kind: "demo",
        input: { query: "hello" },
      },
    };

    expect(mapOrchestrationEvent(event)).toEqual({
      type: "orchestration_run_start",
      runId: "run-1",
      initialTask: {
        id: "task-1",
        kind: "demo",
        input: { query: "hello" },
      },
    });
  });

  it("maps agent_closed into a subagent_closed event", () => {
    const event: OrchestrationEvent = {
      eventId: "evt-2",
      occurredAt: "2026-03-29T00:00:00.000Z",
      runId: "run-1",
      type: "agent_closed",
      close: {
        agentId: "agent-1",
        reason: "done",
      },
    };

    expect(mapOrchestrationEvent(event)).toEqual({
      type: "subagent_closed",
      agentId: "agent-1",
      reason: "done",
      finalStatus: "closed",
    });
  });

  it("returns null for internal-only events", () => {
    const event: OrchestrationEvent = {
      eventId: "evt-3",
      occurredAt: "2026-03-29T00:00:00.000Z",
      runId: "run-1",
      type: "agent_input_removed",
      inputId: "input-1",
      agentId: "agent-1",
      reason: "cancelled",
    };

    expect(mapOrchestrationEvent(event)).toBeNull();
  });
});
