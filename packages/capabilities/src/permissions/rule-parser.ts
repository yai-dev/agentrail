/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { PermissionRule } from "./types.js";

/**
 * Parses a permission rule string into a structured `PermissionRule`.
 *
 * Accepted formats:
 * - `"Bash"` → `{ toolName: "Bash" }`
 * - `"Bash(git:*)"` → `{ toolName: "Bash", pattern: "git:*" }`
 * - `"Write(/workspace/**)"` → `{ toolName: "Write", pattern: "/workspace/**" }`
 *
 * @throws {Error} if the string is empty or malformed.
 */
export function parseRule(s: string): PermissionRule {
  const trimmed = s.trim();
  if (!trimmed) {
    throw new Error(`Invalid permission rule: empty string`);
  }

  const parenOpen = trimmed.indexOf("(");
  if (parenOpen === -1) {
    // Plain tool name, no pattern
    return { toolName: trimmed };
  }

  if (!trimmed.endsWith(")")) {
    throw new Error(`Invalid permission rule "${s}": missing closing parenthesis`);
  }

  const toolName = trimmed.slice(0, parenOpen).trim();
  if (!toolName) {
    throw new Error(`Invalid permission rule "${s}": tool name is empty`);
  }

  const pattern = trimmed.slice(parenOpen + 1, -1).trim();
  if (!pattern) {
    throw new Error(`Invalid permission rule "${s}": pattern inside parentheses is empty`);
  }

  return { toolName, pattern };
}

/**
 * Parses an array of rule strings, collecting and re-throwing any parse
 * errors with the list index included for easier debugging.
 */
export function parseRules(rules: string[]): PermissionRule[] {
  return rules.map((r, i) => {
    try {
      return parseRule(r);
    } catch (err) {
      throw new Error(
        `Permission rule at index ${i} is invalid: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });
}
