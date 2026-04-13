/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

export { DANGEROUS_FILES, DANGEROUS_PATHS, isPathSafe, workspaceAnchor } from "./path-safety.js";
export { evaluatePolicy, matchPattern } from "./rule-engine.js";
export type { ContentMatchMode } from "./rule-engine.js";
export { parseRule, parseRules } from "./rule-parser.js";
export {
  DANGEROUS_BASH_PATTERNS,
  READ_ONLY_COMMANDS,
  isDangerousCommand,
  isReadOnlyCommand,
  normalizeBashCommand,
} from "./shell-safety.js";
export type { PermissionMode, PermissionRule, ToolPermissionPolicy } from "./types.js";
