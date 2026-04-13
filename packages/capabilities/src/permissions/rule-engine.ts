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
 * Matching mode that controls how the `*` wildcard is interpreted.
 *
 * - `"path"` *(default)* — `*` matches any sequence of characters **except**
 *   path separators (`/`).  Use for file-path patterns such as
 *   `Write(/workspace/*)`.
 * - `"command"` — `*` matches **any** sequence of characters including `/`.
 *   Use for Bash command patterns such as `Bash(git:*)`, where the content
 *   after the verb may contain paths like `src/main.ts`.
 *
 * In both modes `**` always matches any sequence including `/`.
 */
export type ContentMatchMode = "path" | "command";

/**
 * Matches `content` against a glob-style `pattern`.
 *
 * Supports:
 * - `**` — matches any sequence of characters including path separators
 * - `*`  — in `"path"` mode (default): matches any sequence **except** `/`;
 *           in `"command"` mode: matches any sequence including `/`
 * - All other characters are matched literally (including `?`)
 *
 * The match is prefix-anchored: `"git:*"` matches content that begins with
 * `"git:"`, while `"/workspace/**"` matches any path under `/workspace/`.
 *
 * @param pattern     Glob-style pattern string.
 * @param content     The string to test against the pattern.
 * @param contentMode Controls how `*` is compiled.  The difference is only
 *                    observable when the pattern has content **after** the
 *                    wildcard.  For example, in `"path"` mode
 *                    `"git:*\/index.ts"` does **not** match
 *                    `"git:src/components/index.ts"` because `[^/]*` stops
 *                    at the first `/`; in `"command"` mode it does because
 *                    `.*` can span multiple segments.  For suffix-only
 *                    wildcards like `"git:*"` both modes behave identically
 *                    due to prefix anchoring (no trailing `$`).
 *                    Defaults to `"path"`.
 */
export function matchPattern(
  pattern: string,
  content: string,
  contentMode: ContentMatchMode = "path",
): boolean {
  const singleWildcard = contentMode === "command" ? ".*" : "[^/]*";
  // Convert glob pattern to a regular expression.
  // Escape regex special chars first (including ? — except * which we handle separately).
  const regexSource = pattern
    .split("**")
    .map((segment) =>
      segment
        .split("*")
        .map((part) => part.replace(/[.+^${}()?|[\]\\]/g, "\\$&"))
        .join(singleWildcard),
    )
    .join(".*");

  const regex = new RegExp(`^${regexSource}`);
  return regex.test(content);
}

/**
 * Returns `true` if any rule in `rules` matches the given `toolName` and
 * optional `content`.
 */
function matchesAny(
  rules: readonly PermissionRule[],
  toolName: string,
  content?: string,
  contentMode: ContentMatchMode = "path",
): boolean {
  for (const rule of rules) {
    if (rule.toolName !== toolName) continue;
    if (!rule.pattern) return true; // bare tool name matches all calls
    if (content !== undefined && matchPattern(rule.pattern, content, contentMode)) return true;
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
 * Evaluation order: **deny → ask → allow → default**
 *
 * Mode adjustments applied after rule evaluation:
 * - `bypassPermissions` — always returns `"allow"` before evaluating rules.
 * - `dontAsk` — demotes `"ask"` to `"deny"`.
 * - `acceptEdits` — promotes `"ask"` to `"allow"` for Write/Edit tools.
 * - `strict` — the default outcome is `"deny"` instead of `"allow"`.  Use
 *   this to build deny-by-default allowlists: add explicit `allow` rules for
 *   permitted operations and everything else is blocked.
 *
 * @param policy      The active permission policy.
 * @param toolName    The name of the tool being called (e.g. `"Bash"`).
 * @param content     The primary argument used for pattern matching (e.g. the
 *                    shell command or file path). May be omitted for tools
 *                    without a meaningful primary argument.
 * @param contentMode Controls how `*` wildcards in patterns are compiled.
 *                    Pass `"command"` for Bash content so that patterns with
 *                    content **after** the wildcard can span `/` — for
 *                    example `"git:*\/index.ts"` matches
 *                    `"git:src/components/index.ts"` in command mode but not
 *                    in path mode.  Suffix-only wildcards like `"git:*"` are
 *                    unaffected by this setting (prefix anchor, no `$`).
 *                    Defaults to `"path"`.
 */
export function evaluatePolicy(
  policy: ToolPermissionPolicy,
  toolName: string,
  content?: string,
  contentMode: ContentMatchMode = "path",
): SimpleDecision {
  if (policy.mode === "bypassPermissions") return "allow";

  if (matchesAny(policy.deny, toolName, content, contentMode)) return "deny";

  if (matchesAny(policy.ask, toolName, content, contentMode)) {
    if (policy.mode === "dontAsk") return "deny";
    if (policy.mode === "acceptEdits" && EDIT_TOOL_NAMES.has(toolName)) return "allow";
    return "ask";
  }

  if (matchesAny(policy.allow, toolName, content, contentMode)) return "allow";

  // Default: deny in strict mode, allow otherwise
  return policy.mode === "strict" ? "deny" : "allow";
}
