/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/**
 * Regression test for the concurrent-first-spawn race condition in
 * ensureActiveRunId().
 *
 * Before the per-session Promise lock was added, two spawn_agent tool calls
 * that arrived on the same session before any run existed could both observe
 * "no run yet", both call manager.startRun(), and produce two run_started
 * events.  This test drives that scenario with a real OrchestrationManager
 * backed by a temporary filesystem directory.
 */

import { createSessionRef } from "@agentrail/core";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createOrchestrationRegistry } from "../src/host/orchestration-registry.js";

describe("OrchestrationRegistry – ensureActiveRunId concurrency", () => {
  it("two concurrent first-spawn calls produce exactly one run", async () => {
    const dataDir = join(tmpdir(), `agentrail-test-${randomUUID()}`);
    const registry = createOrchestrationRegistry({ dataDir });

    const tenantId = "tenant-1";
    const sessionId = randomUUID();
    const userId = "user-1";
    const sessionRef = createSessionRef(tenantId, sessionId);

    const createManagedAgent = vi.fn().mockResolvedValue({
      deliverInput: vi.fn(),
      close: vi.fn(),
    });

    // Initialise the manager.  With the lazy approach no run is started yet.
    const manager = await registry.getManager({
      tenantId,
      userId,
      sessionId,
      sessionRef,
      createManagedAgent,
    });

    expect(Object.keys(manager.getSnapshot().runs)).toHaveLength(0);

    // Simulate two spawn_agent tool invocations racing on the same session.
    // Promise.all ensures both calls are in-flight before either resumes from
    // its first internal await, exercising the concurrent path.
    const [id1, id2] = await Promise.all([
      registry.ensureActiveRunId({ tenantId, userId, sessionId }),
      registry.ensureActiveRunId({ tenantId, userId, sessionId }),
    ]);

    // Both callers must receive the same run id.
    expect(id1).toBe(id2);

    // Exactly one run must have been created — manager.startRun() called once.
    const runs = Object.values(manager.getSnapshot().runs);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("running");
  });

  it("subsequent calls after the first run is live take the fast path", async () => {
    const dataDir = join(tmpdir(), `agentrail-test-${randomUUID()}`);
    const registry = createOrchestrationRegistry({ dataDir });

    const tenantId = "tenant-1";
    const sessionId = randomUUID();
    const userId = "user-1";
    const sessionRef = createSessionRef(tenantId, sessionId);

    await registry.getManager({
      tenantId,
      userId,
      sessionId,
      sessionRef,
      createManagedAgent: vi.fn().mockResolvedValue({ deliverInput: vi.fn(), close: vi.fn() }),
    });

    const id1 = await registry.ensureActiveRunId({ tenantId, userId, sessionId });
    // Second call after run is live — must return the same id without starting another run.
    const id2 = await registry.ensureActiveRunId({ tenantId, userId, sessionId });

    expect(id1).toBe(id2);
  });
});
