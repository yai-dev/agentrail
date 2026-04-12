/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { PermissionRule, ToolPermissionPolicy } from "./types.js";

/** Simple permission outcome — mirrors `PermissionDecision` from @agentrail/core. */
type SimpleDecision = "allow" | "deny" | "ask";

// ============================================================================
// Pattern matching
// ============================================================================

/**
 * Matches `content` against a glob-style `pattern`.
 *
 * Supports:
 * - `**` — matches any sequence of characters including path separators
 * - `*`  — matches any sequence of characters except path separators (`/`)
 * - All other characters are matched literally
 *
 * The match is prefix-anchored: `"git:*"` matches content that begins with
 * `"git:"`, while `"/workspace/**"` matches any path under `/workspace/`.
 */
export function matchPattern(pattern: string, content: string): boolean {
  // Convert glob pattern to a regular expression.
  // Escape regex special chars first (except * which we handle separately).
  const regexSource = pattern
    .split("**")
    .map((segment) =>
      segment
        .split("*")
        .map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*"),
    )
    .join(".*");

  const regex = new RegExp(`^${regexSource}`);
  return regex.test(content);
}

/**
 * Returns `true` if any rule in `rules` matches the given `toolName` and
 * optional `content`.
 */
function matchesAny(rules: readonly PermissionRule[], toolName: string, content?: string): boolean {
  for (const rule of rules) {
    if (rule.toolName !== toolName) continue;
    if (!rule.pattern) return true; // bare tool name matches all calls
    if (content !== undefined && matchPattern(rule.pattern, content)) return true;
  }
  return false;
}

// ============================================================================
// Policy evaluation
// ============================================================================

/**
 * Tools whose `ask` decisions are promoted to `allow` in `acceptEdits` mode.
 */
const EDIT_TOOL_NAMES = new Set(["Write", "Edit"]);

/**
 * Evaluates a `ToolPermissionPolicy` for a given tool call and returns the
 * effective `PermissionDecision`.
 *
 * Evaluation order: **deny → ask → allow → default(allow)**
 *
 * Mode adjustments applied after rule evaluation:
 * - `bypassPermissions` — always returns `"allow"` before evaluating rules.
 * - `dontAsk` — demotes `"ask"` to `"deny"`.
 * - `acceptEdits` — promotes `"ask"` to `"allow"` for Write/Edit tools.
 *
 * @param policy   The active permission policy.
 * @param toolName The name of the tool being called (e.g. `"Bash"`).
 * @param content  The primary argument used for pattern matching (e.g. the
 *                 shell command or file path). May be omitted for tools without
 *                 a meaningful primary argument.
 */
export function evaluatePolicy(
  policy: ToolPermissionPolicy,
  toolName: string,
  content?: string,
): SimpleDecision {
  if (policy.mode === "bypassPermissions") return "allow";

  if (matchesAny(policy.deny, toolName, content)) return "deny";

  if (matchesAny(policy.ask, toolName, content)) {
    if (policy.mode === "dontAsk") return "deny";
    if (policy.mode === "acceptEdits" && EDIT_TOOL_NAMES.has(toolName)) return "allow";
    return "ask";
  }

  if (matchesAny(policy.allow, toolName, content)) return "allow";

  // Default: allow (policy is opt-in deny/ask)
  return "allow";
}
