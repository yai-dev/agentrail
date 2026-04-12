/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it } from "vitest";
import { evaluatePolicy, matchPattern } from "../../src/permissions/rule-engine.js";
import { parseRules } from "../../src/permissions/rule-parser.js";
import type { ToolPermissionPolicy } from "../../src/permissions/types.js";

// ─── matchPattern tests ────────────────────────────────────────────────────────

describe("matchPattern", () => {
  it("matches literal strings exactly", () => {
    expect(matchPattern("git status", "git status")).toBe(true);
    expect(matchPattern("git status", "git log")).toBe(false);
  });

  it("* matches any segment without path separator", () => {
    expect(matchPattern("git *", "git status")).toBe(true);
    expect(matchPattern("git *", "git log --oneline")).toBe(true);
    expect(matchPattern("git *", "npm install")).toBe(false);
  });

  it("** matches across path separators", () => {
    expect(matchPattern("/workspace/**", "/workspace/src/index.ts")).toBe(true);
    expect(matchPattern("/workspace/**", "/workspace/README.md")).toBe(true);
    expect(matchPattern("/workspace/**", "/home/user/file.ts")).toBe(false);
  });

  it("prefix anchor: pattern must match from the start", () => {
    expect(matchPattern("git:*", "git:status")).toBe(true);
    expect(matchPattern("git:*", "npm:install")).toBe(false);
  });

  it("bare tool name pattern (no wildcards) matches exact prefix", () => {
    expect(matchPattern("Bash", "Bash")).toBe(true);
    expect(matchPattern("Bash", "BashExtra")).toBe(true); // prefix match
    expect(matchPattern("Write", "Bash")).toBe(false);
  });
});

// ─── evaluatePolicy tests ─────────────────────────────────────────────────────

function makePolicy(overrides: Partial<ToolPermissionPolicy> = {}): ToolPermissionPolicy {
  return {
    mode: "default",
    allow: [],
    deny: [],
    ask: [],
    ...overrides,
  };
}

describe("evaluatePolicy — bypassPermissions", () => {
  it("always returns allow regardless of rules", () => {
    const policy = makePolicy({
      mode: "bypassPermissions",
      deny: parseRules(["Bash"]),
    });
    expect(evaluatePolicy(policy, "Bash", "rm -rf /")).toBe("allow");
  });
});

describe("evaluatePolicy — deny priority", () => {
  it("deny rule wins over ask and allow rules for the same tool", () => {
    const policy = makePolicy({
      deny: parseRules(["Bash(rm *)"]),
      ask: parseRules(["Bash"]),
      allow: parseRules(["Bash(git *)"]),
    });
    expect(evaluatePolicy(policy, "Bash", "rm -rf /")).toBe("deny");
  });

  it("deny bare tool name blocks all calls", () => {
    const policy = makePolicy({ deny: parseRules(["Write"]) });
    expect(evaluatePolicy(policy, "Write", "/tmp/foo.txt")).toBe("deny");
  });
});

describe("evaluatePolicy — ask behavior", () => {
  it("returns ask in default mode", () => {
    const policy = makePolicy({ ask: parseRules(["Write"]) });
    expect(evaluatePolicy(policy, "Write", "/tmp/foo.txt")).toBe("ask");
  });

  it("dontAsk mode: ask is demoted to deny", () => {
    const policy = makePolicy({ mode: "dontAsk", ask: parseRules(["Write"]) });
    expect(evaluatePolicy(policy, "Write", "/tmp/foo.txt")).toBe("deny");
  });

  it("acceptEdits mode: ask on Write is promoted to allow", () => {
    const policy = makePolicy({ mode: "acceptEdits", ask: parseRules(["Write"]) });
    expect(evaluatePolicy(policy, "Write", "/tmp/foo.txt")).toBe("allow");
  });

  it("acceptEdits mode: ask on Edit is promoted to allow", () => {
    const policy = makePolicy({ mode: "acceptEdits", ask: parseRules(["Edit"]) });
    expect(evaluatePolicy(policy, "Edit", "/tmp/foo.ts")).toBe("allow");
  });

  it("acceptEdits mode: ask on Bash is still ask", () => {
    const policy = makePolicy({ mode: "acceptEdits", ask: parseRules(["Bash"]) });
    expect(evaluatePolicy(policy, "Bash", "npm install")).toBe("ask");
  });
});

describe("evaluatePolicy — allow and default", () => {
  it("explicit allow rule returns allow", () => {
    const policy = makePolicy({ allow: parseRules(["Bash(git:*)"]) });
    expect(evaluatePolicy(policy, "Bash", "git status")).toBe("allow");
  });

  it("no matching rule returns allow (default policy is permissive)", () => {
    const policy = makePolicy();
    expect(evaluatePolicy(policy, "Read", "/workspace/src/index.ts")).toBe("allow");
  });

  it("unrelated tool names do not trigger rules", () => {
    const policy = makePolicy({ deny: parseRules(["Bash"]) });
    expect(evaluatePolicy(policy, "Read", "/workspace/file.ts")).toBe("allow");
  });
});
