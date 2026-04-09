/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, it, expect } from "vitest";
import { filesystem } from "../src/filesystem/index.js";
import { browser } from "../src/browser/index.js";
import type { CapabilityBuildContext } from "../src/types.js";

// Minimal stub that satisfies the shape used by buildTools
const stubCtx = (sandboxManager?: object): CapabilityBuildContext =>
  ({
    tenantId: "t1",
    userId: "u1",
    sessionId: "s1",
    sessionRef: "t1:s1" as never,
    sessionStore: { createTodoStorage: undefined } as never,
    sandboxManager,
  }) as CapabilityBuildContext;

describe("filesystem() capability descriptor", () => {
  it("has type 'filesystem'", () => {
    expect(filesystem().type).toBe("filesystem");
  });

  it("throws a descriptive error when no sandboxManager is available", async () => {
    const cap = filesystem();
    await expect(cap.buildTools(stubCtx(undefined))).rejects.toThrow(
      /sandboxManager/,
    );
  });

  it("accepts a sandboxManager via opts and does not throw during construction", () => {
    const mockSm = {
      ensureSandbox: () => Promise.resolve(),
      ensureImage: () => Promise.resolve(),
      listWorkspace: () => Promise.resolve(""),
    } as never;
    const cap = filesystem({ sandboxManager: mockSm });
    expect(cap.type).toBe("filesystem");
  });

  it("includes Sleep and Glob in the default filesystem toolset", async () => {
    const mockSm = {
      ensureSandbox: () => Promise.resolve(),
      ensureImage: () => Promise.resolve(),
      listWorkspace: () => Promise.resolve(""),
    } as never;
    const cap = filesystem({ sandboxManager: mockSm });
    const tools = await cap.buildTools(stubCtx(undefined));
    expect(tools.map((tool) => tool.name)).toContain("Glob");
    expect(tools.map((tool) => tool.name)).toContain("Sleep");
  });
});

describe("browser() capability descriptor", () => {
  it("has type 'browser'", () => {
    expect(browser().type).toBe("browser");
  });

  it("throws a descriptive error when no sandboxManager is available", async () => {
    const cap = browser();
    await expect(cap.buildTools(stubCtx(undefined))).rejects.toThrow(
      /sandboxManager/,
    );
  });

  it("prefers opts.sandboxManager over ctx.sandboxManager", async () => {
    const mockSm = {
      ensureSandbox: () => Promise.resolve(),
      ensureImage: () => Promise.resolve(),
      browserNavigate: () => Promise.resolve({}),
      browserAction: () => Promise.resolve({}),
      browserScroll: () => Promise.resolve({}),
      browserContent: () => Promise.resolve({}),
    } as never;
    const cap = browser({ sandboxManager: mockSm });
    // Should not throw — sandboxManager is provided via opts
    await expect(cap.buildTools(stubCtx(undefined))).resolves.toBeDefined();
  });
});
