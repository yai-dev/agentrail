/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createOrchestrationRegistry } from "../src/orchestration-registry.js";

describe("createOrchestrationRegistry", () => {
  it("creates a manager once per session and invalidates it on demand", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "agentrail-host-orchestration-"));
    const createManagedAgent = vi.fn(async () => ({
      deliverInput: async () => {},
      close: async () => {},
    }));

    try {
      const registry = createOrchestrationRegistry({ dataDir });

      const first = await registry.getManager({
        tenantId: "tenant-1",
        userId: "user-1",
        sessionId: "session-1",
        createManagedAgent,
      });
      const second = await registry.getManager({
        tenantId: "tenant-1",
        userId: "user-1",
        sessionId: "session-1",
        createManagedAgent,
      });

      expect(second).toBe(first);
      expect(first.getSnapshot().run?.id).toBe("orchestration:session-1");

      registry.invalidate("tenant-1", "session-1");

      const third = await registry.getManager({
        tenantId: "tenant-1",
        userId: "user-1",
        sessionId: "session-1",
        createManagedAgent,
      });

      expect(third).not.toBe(first);
      expect(third.getSnapshot().run?.id).toBe("orchestration:session-1");
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
