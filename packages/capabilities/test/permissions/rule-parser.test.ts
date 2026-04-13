/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it } from "vitest";
import { parseRule, parseRules } from "../../src/permissions/rule-parser.js";

describe("parseRule", () => {
  it("parses a bare tool name", () => {
    expect(parseRule("Bash")).toEqual({ toolName: "Bash" });
    expect(parseRule("Write")).toEqual({ toolName: "Write" });
  });

  it("trims whitespace around the input", () => {
    expect(parseRule("  Bash  ")).toEqual({ toolName: "Bash" });
  });

  it("parses tool name with pattern", () => {
    expect(parseRule("Bash(git:*)")).toEqual({ toolName: "Bash", pattern: "git:*" });
    expect(parseRule("Write(/workspace/**)")).toEqual({
      toolName: "Write",
      pattern: "/workspace/**",
    });
  });

  it("throws on empty string", () => {
    expect(() => parseRule("")).toThrow();
    expect(() => parseRule("   ")).toThrow();
  });

  it("throws when closing parenthesis is missing", () => {
    expect(() => parseRule("Bash(git:*")).toThrow(/missing closing/i);
  });

  it("throws when tool name is missing before parenthesis", () => {
    expect(() => parseRule("(git:*)")).toThrow(/tool name is empty/i);
  });

  it("throws when pattern inside parentheses is empty", () => {
    expect(() => parseRule("Bash()")).toThrow(/pattern inside parentheses is empty/i);
  });
});

describe("parseRules", () => {
  it("parses an array of rule strings", () => {
    const rules = parseRules(["Bash", "Write(/tmp/*)"]);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toEqual({ toolName: "Bash" });
    expect(rules[1]).toEqual({ toolName: "Write", pattern: "/tmp/*" });
  });

  it("throws with index info when one rule is invalid", () => {
    expect(() => parseRules(["Bash", ""])).toThrow(/index 1/i);
  });
});
