/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it } from "vitest";
import { buildDefaultCapabilityTools } from "../src/host/defaults/capability-tools.js";

describe("buildDefaultCapabilityTools", () => {
  it("includes Sleep and Glob in the default execution tools", async () => {
    const result = await buildDefaultCapabilityTools({
      tenantId: "t1",
      userId: "u1",
      sessionId: "s1",
      sessionRef: "t1:s1" as never,
      sessionStore: {
        createTodoStorage: () => "/tmp/todo.md",
      } as never,
      knowledgeManager: {} as never,
      sandboxManager: {} as never,
      waitHandleRegistry: {} as never,
      modelConfig: { provider: "openai", modelId: "gpt-5.4" },
      includeSkillTool: false,
    });

    expect(result.executionTools.map((tool) => tool.name)).toContain("Glob");
    expect(result.executionTools.map((tool) => tool.name)).toContain("Sleep");
  });
});
