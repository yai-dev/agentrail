/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it, vi } from "vitest";
import { createUserMemoryPlugin } from "../src/index.js";

describe("createUserMemoryPlugin", () => {
  it("binds lifecycle and activity hooks to the provided service", async () => {
    const service = {
      start: vi.fn(),
      stop: vi.fn(),
      beginForegroundActivity: vi.fn(),
      endForegroundActivity: vi.fn(),
      touchActivity: vi.fn(async () => {}),
    };

    const plugin = createUserMemoryPlugin(service);

    expect(plugin.name).toBe("user-memory");

    plugin.start?.();
    plugin.stop?.();
    plugin.onRequestStart?.({
      kind: "chat",
      tenantId: "tenant-1",
      userId: "user-1",
      sessionId: "session-1",
      agentId: "agent-1",
    });
    plugin.onRequestEnd?.({
      kind: "chat",
      tenantId: "tenant-1",
      userId: "user-1",
      sessionId: "session-1",
      agentId: "agent-1",
    });
    await plugin.onTurnPersisted?.({
      kind: "chat",
      tenantId: "tenant-1",
      userId: "user-1",
      sessionId: "session-1",
      agentId: "agent-1",
    });

    expect(service.start).toHaveBeenCalledOnce();
    expect(service.stop).toHaveBeenCalledOnce();
    expect(service.beginForegroundActivity).toHaveBeenCalledWith("tenant-1", "user-1");
    expect(service.endForegroundActivity).toHaveBeenCalledWith("tenant-1", "user-1");
    expect(service.touchActivity).toHaveBeenCalledWith("tenant-1", "user-1");
  });
});
