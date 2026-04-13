/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it } from "vitest";
import { evaluatePolicy, matchPattern } from "../../src/permissions/rule-engine.js";
import { parseRules } from "../../src/permissions/rule-parser.js";
import { isDangerousCommand, normalizeBashCommand } from "../../src/permissions/shell-safety.js";
import type { ToolPermissionPolicy } from "../../src/permissions/types.js";

// ─── isDangerousCommand tests ─────────────────────────────────────────────────

describe("isDangerousCommand", () => {
  it("blocks rm -rf / variants", () => {
    // combined flag block
    expect(isDangerousCommand("rm -rf /")).toBe(true);
    expect(isDangerousCommand("rm -fr /")).toBe(true);
    expect(isDangerousCommand("rm -Rf /")).toBe(true);
    expect(isDangerousCommand("rm -rrf /")).toBe(true);
    // separate flag tokens
    expect(isDangerousCommand("rm -r -f /")).toBe(true);
    expect(isDangerousCommand("rm -f -r /")).toBe(true);
  });

  it("blocks fork bomb", () => {
    expect(isDangerousCommand(":(){:|:&};:")).toBe(true);
  });

  it("blocks dd writing to block device", () => {
    expect(isDangerousCommand("dd if=/dev/zero of=/dev/sda")).toBe(true);
  });

  it("does not block safe rm commands", () => {
    expect(isDangerousCommand("rm -rf ./build")).toBe(false);
    expect(isDangerousCommand("rm -rf /tmp/workdir")).toBe(false);
    expect(isDangerousCommand("rm file.txt")).toBe(false);
  });
});

// ─── normalizeBashCommand tests ───────────────────────────────────────────────

describe("normalizeBashCommand", () => {
  it("converts first space to colon", () => {
    expect(normalizeBashCommand("git status")).toBe("git:status");
    expect(normalizeBashCommand("npm install lodash")).toBe("npm:install lodash");
    expect(normalizeBashCommand("rm -rf /")).toBe("rm:-rf /");
  });

  it("returns single-word commands unchanged", () => {
    expect(normalizeBashCommand("ls")).toBe("ls");
  });

  it("trims leading whitespace before splitting", () => {
    expect(normalizeBashCommand("  git log --oneline")).toBe("git:log --oneline");
  });

  it("handles tab between verb and args", () => {
    expect(normalizeBashCommand("git\tstatus")).toBe("git:status");
    expect(normalizeBashCommand("npm\tinstall lodash")).toBe("npm:install lodash");
  });
});

// ─── Bash DSL end-to-end (pattern matching after normalization) ────────────────

describe("Bash DSL — colon-convention patterns via normalizeBashCommand", () => {
  it("git:* matches any git command after normalization", () => {
    const policy: ToolPermissionPolicy = {
      mode: "default",
      allow: parseRules(["Bash(git:*)"]),
      deny: [],
      ask: [],
    };
    expect(evaluatePolicy(policy, "Bash", normalizeBashCommand("git status"))).toBe("allow");
    expect(evaluatePolicy(policy, "Bash", normalizeBashCommand("git log --oneline"))).toBe("allow");
    expect(evaluatePolicy(policy, "Bash", normalizeBashCommand("npm install"))).toBe("allow"); // default
  });

  it("rm:* deny rule blocks rm commands", () => {
    const policy: ToolPermissionPolicy = {
      mode: "default",
      allow: [],
      deny: parseRules(["Bash(rm:*)"]),
      ask: [],
    };
    expect(evaluatePolicy(policy, "Bash", normalizeBashCommand("rm -rf /"))).toBe("deny");
    expect(evaluatePolicy(policy, "Bash", normalizeBashCommand("rm file.txt"))).toBe("deny");
    expect(evaluatePolicy(policy, "Bash", normalizeBashCommand("git status"))).toBe("allow");
  });
});

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

// ─── contentMode tests ────────────────────────────────────────────────────────
//
// The behavioral difference between path and command mode only matters when
// the pattern has content AFTER the wildcard (e.g. "git:*/index.ts").
// For suffix-only wildcards like "git:*", both modes behave identically
// because the regex is prefix-anchored (no trailing $) and [^/]* can match
// up to the first / in the content.

describe("matchPattern — contentMode", () => {
  it("command mode: * matches across / in suffix-wildcard patterns", () => {
    expect(matchPattern("git:*", "git:add src/main.ts", "command")).toBe(true);
    expect(matchPattern("git:*", "git:status", "command")).toBe(true);
    expect(matchPattern("npm:*", "npm:install lodash", "command")).toBe(true);
  });

  it("path mode: * stops at / when pattern has content after the wildcard", () => {
    // "git:*/index.ts" — path mode cannot skip "components/" to find "index.ts"
    expect(matchPattern("git:*/index.ts", "git:src/components/index.ts", "path")).toBe(false);
    // same pattern in a single-segment path does work in path mode
    expect(matchPattern("git:*/index.ts", "git:src/index.ts", "path")).toBe(true);
  });

  it("command mode: * matches across / even with content after the wildcard", () => {
    // "git:*/index.ts" — command mode can match multi-segment paths
    expect(matchPattern("git:*/index.ts", "git:src/components/index.ts", "command")).toBe(true);
  });

  it("command mode: ** still matches across / as well", () => {
    expect(matchPattern("/workspace/**", "/workspace/src/index.ts", "command")).toBe(true);
  });

  it("unrelated tool prefix never matches regardless of mode", () => {
    expect(matchPattern("git:*", "npm:install", "command")).toBe(false);
    expect(matchPattern("git:*", "npm:install", "path")).toBe(false);
  });
});

describe("evaluatePolicy — contentMode plumbing", () => {
  it("Bash allow rule in command mode correctly matches content with path separator", () => {
    const policy = makePolicy({ allow: parseRules(["Bash(git:*)"]) });
    // git:add src/main.ts — suffix wildcard; both modes match, but command mode
    // is the documented convention for Bash tools
    expect(evaluatePolicy(policy, "Bash", "git:add src/main.ts", "command")).toBe("allow");
  });

  it("Bash deny rule in command mode fires for path-containing arguments", () => {
    // "Bash(git:add *)" with a .ts file deeper in a directory tree
    // path mode: "^git:add [^/]*" matches prefix "git:add src" → deny fires
    // command mode: "^git:add .*" matches full string → deny fires
    // Both deny, confirming plumbing is intact in command mode
    const policy = makePolicy({ deny: parseRules(["Bash(git:add *)"]) });
    expect(evaluatePolicy(policy, "Bash", "git:add src/main.ts", "command")).toBe("deny");
  });
});

// ─── strict mode tests ────────────────────────────────────────────────────────

describe("evaluatePolicy — strict mode", () => {
  it("returns deny by default when no rule matches", () => {
    const policy = makePolicy({ mode: "strict" });
    expect(evaluatePolicy(policy, "Bash", "git status")).toBe("deny");
    expect(evaluatePolicy(policy, "Read", "/workspace/file.ts")).toBe("deny");
  });

  it("explicit allow rule overrides the strict deny default", () => {
    const policy = makePolicy({
      mode: "strict",
      allow: parseRules(["Bash(git:*)"]),
    });
    expect(evaluatePolicy(policy, "Bash", "git:status", "command")).toBe("allow");
    expect(evaluatePolicy(policy, "Bash", "npm:install", "command")).toBe("deny");
  });

  it("deny rules still work in strict mode", () => {
    const policy = makePolicy({
      mode: "strict",
      allow: parseRules(["Bash"]),
      deny: parseRules(["Bash(rm:*)"]),
    });
    expect(evaluatePolicy(policy, "Bash", "rm:-rf /", "command")).toBe("deny");
    expect(evaluatePolicy(policy, "Bash", "git:status", "command")).toBe("allow");
  });
});
