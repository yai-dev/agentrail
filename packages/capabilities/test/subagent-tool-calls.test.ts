/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/**
 * Tests for the sub-agent toolCalls propagation chain (Issue #23).
 *
 * Covers:
 * - normalizeDeliveryResult() passes toolCalls through
 * - OrchestrationManager stores toolCalls in agent.lastJob after job completion
 * - OrchestrationManager includes toolCalls in wait resolution
 * - wait_agent formatWaitResult includes resolution (outputText + toolCalls)
 */

import { createSessionRef } from "@agentrail/core";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { normalizeDeliveryResult } from "../src/orchestration/orchestration-manager-helpers.js";
import {
  OrchestrationManager,
  type OrchestrationAgentFactory,
} from "../src/orchestration/orchestration-manager.js";
import { createFilesystemOrchestrationPersistence } from "../src/orchestration/persistence.js";
import { createWaitAgentTool } from "../src/orchestration/tools/wait-agent.js";
import type { AgentInputEnvelope, AgentToolCallRecord } from "../src/orchestration/types.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function makeEnvelope(id = "input-1"): AgentInputEnvelope {
  return {
    id,
    agentId: "agent-1",
    payload: { prompt: "do something" },
    queuedAt: new Date().toISOString(),
  };
}

const SAMPLE_TOOL_CALLS: AgentToolCallRecord[] = [
  {
    toolCallId: "call-1",
    toolName: "search",
    input: { query: "hello world" },
    output: {
      content: [{ type: "text", text: "Results: ..." }],
      details: { count: 3, urls: ["https://example.com"] },
    },
  },
  {
    toolCallId: "call-2",
    toolName: "calculator",
    input: { expression: "1 + 1" },
    output: {
      content: [{ type: "text", text: "2" }],
      details: { result: 2 },
    },
  },
];

async function createManager() {
  const dataDir = join(tmpdir(), `agentrail-test-${randomUUID()}`);
  const sessionRef = createSessionRef("tenant-1", randomUUID());
  const deliverInput = vi.fn();
  const runtime: OrchestrationAgentFactory = {
    createAgent: vi.fn().mockResolvedValue({ deliverInput, close: vi.fn() }),
  };
  const manager = await OrchestrationManager.create({
    persistence: createFilesystemOrchestrationPersistence(dataDir, sessionRef),
    runtime,
  });
  return { manager, deliverInput };
}

// ---------------------------------------------------------------------------
// normalizeDeliveryResult
// ---------------------------------------------------------------------------

describe("normalizeDeliveryResult", () => {
  it("passes toolCalls through when present", () => {
    const result = normalizeDeliveryResult(
      makeEnvelope(),
      {
        jobId: "job-1",
        consumedInputIds: ["input-1"],
        outcome: "completed",
        outputText: "done",
        toolCalls: SAMPLE_TOOL_CALLS,
      },
      new Date().toISOString(),
    );

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls![0].toolName).toBe("search");
    expect(result.toolCalls![0].input).toEqual({ query: "hello world" });
    const out0 = result.toolCalls![0].output as { content: unknown[]; details?: unknown };
    expect(out0.details).toEqual({ count: 3, urls: ["https://example.com"] });
    expect(result.toolCalls![1].toolName).toBe("calculator");
  });

  it("preserves undefined toolCalls when not present in result", () => {
    const result = normalizeDeliveryResult(
      makeEnvelope(),
      {
        jobId: "job-2",
        consumedInputIds: ["input-1"],
        outcome: "completed",
        outputText: "done",
      },
      new Date().toISOString(),
    );
    expect(result.toolCalls).toBeUndefined();
  });

  it("falls back gracefully when result is void (error recovery path)", () => {
    const result = normalizeDeliveryResult(makeEnvelope(), undefined, new Date().toISOString());
    expect(result.outcome).toBe("completed");
    expect(result.toolCalls).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// OrchestrationManager – toolCalls stored in agent.lastJob
// ---------------------------------------------------------------------------

describe("OrchestrationManager – toolCalls in lastJob", () => {
  it("stores toolCalls in agent.lastJob after a successful job", async () => {
    const { manager, deliverInput } = await createManager();
    const runId = randomUUID();
    await manager.startRun({
      runId,
      initialTask: { id: randomUUID(), kind: "test", input: {} },
    });
    const agentId = "agent-tc-test";

    await manager.spawnAgent({ id: agentId, runId, role: "researcher" });

    deliverInput.mockResolvedValueOnce({
      jobId: "job-tc-1",
      consumedInputIds: ["input-1"],
      outcome: "completed",
      outputText: "Research complete",
      toolCalls: SAMPLE_TOOL_CALLS,
    });

    await manager.sendInput({ id: "input-1", agentId, payload: { prompt: "research" } });

    // waitForAgents blocks until delivery loop finishes and agent becomes idle.
    await manager.waitForAgents({
      id: "wait-tc-1",
      agentId,
      kind: "agent-idle",
      description: "wait for job",
    });

    const agent = manager.getSnapshot().agents[agentId];
    expect(agent?.lastJob?.toolCalls).toHaveLength(2);
    expect(agent?.lastJob?.toolCalls![0].toolName).toBe("search");
    expect(agent?.lastJob?.toolCalls![0].input).toEqual({ query: "hello world" });
    const out = agent?.lastJob?.toolCalls![0].output as { details?: unknown };
    expect(out?.details).toEqual({ count: 3, urls: ["https://example.com"] });
    expect(agent?.lastJob?.toolCalls![1].toolName).toBe("calculator");
    expect(agent?.lastJob?.outputText).toBe("Research complete");
  });

  it("stores undefined toolCalls when sub-agent made no tool calls", async () => {
    const { manager, deliverInput } = await createManager();
    const runId = randomUUID();
    await manager.startRun({
      runId,
      initialTask: { id: randomUUID(), kind: "test", input: {} },
    });
    const agentId = "agent-no-tools";

    await manager.spawnAgent({ id: agentId, runId, role: "writer" });

    deliverInput.mockResolvedValueOnce({
      jobId: "job-no-tools",
      consumedInputIds: ["input-2"],
      outcome: "completed",
      outputText: "Plain text output",
    });

    await manager.sendInput({ id: "input-2", agentId, payload: { prompt: "write" } });

    await manager.waitForAgents({
      id: "wait-no-tools",
      agentId,
      kind: "agent-idle",
      description: "wait for job",
    });

    const agent = manager.getSnapshot().agents[agentId];
    expect(agent?.lastJob?.toolCalls).toBeUndefined();
    expect(agent?.lastJob?.outputText).toBe("Plain text output");
  });
});

// ---------------------------------------------------------------------------
// OrchestrationManager – toolCalls in wait resolution
// ---------------------------------------------------------------------------

describe("OrchestrationManager – toolCalls in wait resolution", () => {
  it("includes toolCalls in resolution.job when kind is agent-idle", async () => {
    const { manager, deliverInput } = await createManager();
    const runId = randomUUID();
    await manager.startRun({
      runId,
      initialTask: { id: randomUUID(), kind: "test", input: {} },
    });
    const agentId = "agent-wait-res";

    await manager.spawnAgent({ id: agentId, runId, role: "worker" });

    deliverInput.mockResolvedValueOnce({
      jobId: "job-wait-1",
      consumedInputIds: ["input-3"],
      outcome: "completed",
      outputText: "Work done",
      toolCalls: SAMPLE_TOOL_CALLS,
    });

    await manager.sendInput({ id: "input-3", agentId, payload: { prompt: "do work" } });

    const wait = await manager.waitForAgents({
      id: "wait-res-1",
      agentId,
      kind: "agent-idle",
      description: "wait for result",
    });

    const job = (
      wait.resolution as { job?: { toolCalls?: AgentToolCallRecord[]; outputText?: string } }
    )?.job;
    expect(job?.outputText).toBe("Work done");
    expect(job?.toolCalls).toHaveLength(2);
    expect(job?.toolCalls![0].toolName).toBe("search");
    expect(job?.toolCalls![1].toolName).toBe("calculator");
  });
});

// ---------------------------------------------------------------------------
// wait-agent tool – formatWaitResult includes resolution
// ---------------------------------------------------------------------------

describe("wait-agent formatWaitResult", () => {
  it("includes resolution in the JSON content when wait resolves with a job", async () => {
    const { manager, deliverInput } = await createManager();
    const runId = randomUUID();
    await manager.startRun({
      runId,
      initialTask: { id: randomUUID(), kind: "test", input: {} },
    });
    const agentId = "agent-fmt-test";

    await manager.spawnAgent({ id: agentId, runId, role: "worker" });

    deliverInput.mockResolvedValueOnce({
      jobId: "job-fmt-1",
      consumedInputIds: ["input-4"],
      outcome: "completed",
      outputText: "Output text here",
      toolCalls: SAMPLE_TOOL_CALLS,
    });

    await manager.sendInput({ id: "input-4", agentId, payload: { prompt: "go" } });

    // Drain the delivery so agent is idle before calling the wait_agent tool.
    await manager.waitForAgents({
      id: "pre-wait",
      agentId,
      kind: "agent-idle",
      description: "wait for idle",
    });

    // Invoke the wait_agent tool — agent is already idle, so it resolves immediately.
    const waitTool = createWaitAgentTool(manager);
    const result = await waitTool.execute("call-wait", {
      id: "wait-fmt-1",
      agentId,
      kind: "agent-idle",
      description: "wait",
    });

    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    const parsed = JSON.parse(text) as {
      waitId: string;
      resolution?: {
        job?: { outputText?: string; toolCalls?: AgentToolCallRecord[] };
      };
    };

    expect(parsed.resolution?.job?.outputText).toBe("Output text here");
    expect(parsed.resolution?.job?.toolCalls).toHaveLength(2);
    expect(parsed.resolution?.job?.toolCalls![0].toolName).toBe("search");
  });
});
