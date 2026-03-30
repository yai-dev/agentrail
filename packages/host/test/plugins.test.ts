/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it, vi } from "vitest";
import {
  collectPluginContextProviders,
  runAttachmentHandlers,
  runPluginRequestHook,
  runPluginLifecycle,
} from "../src/plugins.js";

describe("host plugin helpers", () => {
  it("collects base and plugin context providers in order", async () => {
    const baseProvider = vi.fn(async () => []);
    const pluginProvider = vi.fn(async () => []);

    const providers = collectPluginContextProviders(
      [
        {
          name: "plugin-a",
          contextProviders: [pluginProvider],
        },
      ],
      [baseProvider],
    );

    expect(providers).toEqual([baseProvider, pluginProvider]);
  });

  it("runs plugin lifecycle and activity hooks", async () => {
    const plugin = {
      name: "plugin-a",
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      onRequestStart: vi.fn(async () => {}),
    };

    await runPluginLifecycle([plugin], "start");
    await runPluginLifecycle([plugin], "stop");
    await runPluginRequestHook(
      [plugin],
      "onRequestStart",
      {
        kind: "chat",
        tenantId: "tenant-1",
        userId: "user-1",
        sessionId: "session-1",
        agentId: "agent-1",
      },
    );

    expect(plugin.start).toHaveBeenCalledOnce();
    expect(plugin.stop).toHaveBeenCalledOnce();
    expect(plugin.onRequestStart).toHaveBeenCalledWith({
      kind: "chat",
      tenantId: "tenant-1",
      userId: "user-1",
      sessionId: "session-1",
      agentId: "agent-1",
    });
  });

  it("merges attachment handler context text from plugins and fallback handler", async () => {
    const result = await runAttachmentHandlers(
      [
        {
          name: "notes.txt",
          mimeType: "text/plain",
          containerPath: "/workspace/uploads/notes.txt",
          sizeKb: 1,
        },
      ],
      [
        {
          name: "plugin-a",
          attachmentHandler: async () => ({ contextText: "plugin" }),
        },
      ],
      async () => ({ contextText: "fallback" }),
    );

    expect(result).toEqual({
      contextText: "plugin\n\nfallback",
    });
  });
});
