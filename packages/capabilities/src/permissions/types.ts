/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/**
 * Controls how the permission engine treats `ask` decisions and whether it
 * bypasses the policy entirely.
 *
 * - `default` — dangerous operations raise an `ask` decision that surfaces a
 *   `permission_request` event; execution is denied until the host provides an
 *   interactive approval mechanism.
 * - `acceptEdits` — `ask` decisions on `Write` and `Edit` tools are
 *   automatically promoted to `allow`; shell execution still raises `ask`.
 * - `bypassPermissions` — all `checkPermissions` calls return `allow`
 *   unconditionally (trusted automation / admin contexts only).
 * - `dontAsk` — `ask` decisions are demoted to `deny`; intended for headless
 *   environments where there is no user present to answer prompts.
 * - `strict` — deny-by-default; the policy default outcome is `"deny"` rather
 *   than `"allow"`.  Add explicit `allow` rules to whitelist permitted
 *   operations.  Use this to build a minimal-privilege configuration where only
 *   named tool calls are permitted.
 */
export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "dontAsk" | "strict";

/**
 * A single parsed permission rule.
 *
 * Rules are expressed in a `ToolName` or `ToolName(content-pattern)` DSL:
 * - `"Bash"` → matches any Bash call
 * - `"Bash(git:*)"` → matches Bash calls whose command starts with `git `
 * - `"Write(/workspace/**)"` → matches Write calls whose `file_path` begins
 *   with `/workspace/`
 */
export interface PermissionRule {
  /** The tool name this rule applies to (case-sensitive). */
  readonly toolName: string;
  /**
   * Optional glob-style content pattern matched against the tool's primary
   * argument (command string for Bash, file path for file tools, etc.).
   * When absent, the rule matches any call to the tool.
   */
  readonly pattern?: string;
}

/**
 * The full permission policy applied to a session or tenant.
 *
 * Rules are evaluated in priority order: **deny → ask → allow → default**.
 * The first matching rule in the highest-priority list wins.
 */
export interface ToolPermissionPolicy {
  /**
   * Overarching permission mode that modulates how `ask` decisions are treated.
   * Defaults to `"default"` when absent.
   */
  readonly mode: PermissionMode;
  /** Rules that unconditionally allow matching tool calls. */
  readonly allow: readonly PermissionRule[];
  /** Rules that unconditionally deny matching tool calls. */
  readonly deny: readonly PermissionRule[];
  /**
   * Rules that require user confirmation before execution.
   * In `dontAsk` mode these are treated as `deny`.
   * In `acceptEdits` mode these are treated as `allow` for Write/Edit.
   */
  readonly ask: readonly PermissionRule[];
}
