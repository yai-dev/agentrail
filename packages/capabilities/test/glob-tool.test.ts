/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSandboxedGlob } from "../src/sandbox/tools/sandboxed-glob.js";
import { createGlobTool } from "../src/tools/glob.js";

function makeTempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "agentrail-glob-"));
}

describe("createGlobTool", () => {
  afterEach(() => {
    // no-op; temp dirs live under OS temp
  });

  it("matches files relative to the search root", async () => {
    const rootDir = makeTempDir();
    mkdirSync(path.join(rootDir, "src", "nested"), { recursive: true });
    writeFileSync(path.join(rootDir, "src", "a.ts"), "export {};\n");
    writeFileSync(path.join(rootDir, "src", "nested", "b.ts"), "export {};\n");

    const tool = createGlobTool(rootDir);
    const result = await tool.execute("call-1", {
      pattern: "**/*.ts",
      path: "src",
    });

    expect(result.details).toEqual({
      searchRoot: path.join(rootDir, "src"),
      matches: ["a.ts", "nested/b.ts"],
    });
  });

  it("rejects paths outside the configured root", async () => {
    const rootDir = makeTempDir();
    const tool = createGlobTool(rootDir);

    const result = await tool.execute("call-2", {
      pattern: "**/*.ts",
      path: "../outside",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("outside the allowed root directory"),
    });
    expect(result.details).toEqual({
      searchRoot: rootDir,
      matches: [],
    });
  });
});

describe("createSandboxedGlob", () => {
  it("matches files inside the sandbox workspace", async () => {
    const rootDir = makeTempDir();
    mkdirSync(path.join(rootDir, "workspace", "src"), { recursive: true });
    writeFileSync(path.join(rootDir, "workspace", "src", "main.ts"), "export {};\n");

    const manager = {
      ensureSandbox: async () => {},
      translateToHostPath: (_sessionId: string, sandboxPath: string) => {
        if (!sandboxPath.startsWith("/workspace")) {
          throw new Error("outside workspace");
        }
        return path.join(rootDir, sandboxPath.slice(1));
      },
    } as never;

    const tool = createSandboxedGlob(manager, "s1", "t1", "u1");
    const result = await tool.execute("call-3", {
      pattern: "**/*.ts",
      path: "/workspace/src",
    });

    expect(result.details).toEqual({
      searchRoot: "/workspace/src",
      matches: ["main.ts"],
    });
  });

  it("rejects sandbox paths outside the workspace", async () => {
    const manager = {
      ensureSandbox: async () => {},
      translateToHostPath: () => {
        throw new Error("outside workspace");
      },
    } as never;

    const tool = createSandboxedGlob(manager, "s1", "t1", "u1");
    const result = await tool.execute("call-4", {
      pattern: "**/*.ts",
      path: "/tmp",
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("outside the sandbox workspace"),
    });
    expect(result.details).toEqual({
      searchRoot: "/tmp",
      matches: [],
    });
  });
});
