/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// ============================================================================
// Dangerous command patterns
// ============================================================================

/**
 * Regex patterns matched against the full command string (case-insensitive).
 * A command that matches any of these is considered unconditionally dangerous
 * and will be denied regardless of the active permission policy.
 */
export const DANGEROUS_BASH_PATTERNS: readonly RegExp[] = [
  // Fork bomb
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;/,
  // Wipe entire filesystem.
  // Single combined flag block containing 'f', e.g. rm -rf /, rm -rrf /, rm -Rf /
  // (no outer repetition avoids ReDoS from nested quantifiers)
  /\brm\s+-[a-z]*f[a-z]*\s+\/\s*($|\|)/i,
  // Separate flag tokens with force flag second, e.g. rm -r -f /
  /\brm\s+-[a-z]+\s+-[a-z]*f[a-z]*\s+\/\s*($|\|)/i,
  // Separate flag tokens with force flag first, e.g. rm -f -r /
  /\brm\s+-[a-z]*f[a-z]*\s+-[a-z]+\s+\/\s*($|\|)/i,
  // Low-level disk write
  /\bdd\s+.*of=\/dev\/(sd|hd|nvme|xvd|vd)/i,
  // Format filesystem
  /\b(mkfs|mke2fs|mkswap)\b/i,
  // Overwrite block device
  />\s*\/dev\/(sd|hd|nvme|xvd|vd)/i,
  // Kernel module manipulation
  /\b(insmod|rmmod|modprobe)\b/i,
  // Dangerous network exfil
  /\bchmod\s+777\s+\//i,
];

/**
 * Command prefixes (first word of the command) considered read-only.
 * When `isReadOnlyCommand` is used to enforce a read-only policy, only
 * commands whose first word appears in this set are allowed.
 */
export const READ_ONLY_COMMANDS: ReadonlySet<string> = new Set([
  "cat",
  "less",
  "more",
  "head",
  "tail",
  "ls",
  "ll",
  "dir",
  "pwd",
  "echo",
  "printf",
  "grep",
  "rg",
  "find",
  "locate",
  "which",
  "whereis",
  "type",
  "file",
  "stat",
  "wc",
  "diff",
  "cmp",
  "md5sum",
  "sha256sum",
  "sha1sum",
  "xxd",
  "hexdump",
  "od",
  "strings",
  "sort",
  "uniq",
  "cut",
  "tr",
  "awk",
  "sed", // read-only usage (no -i)
  "jq",
  "yq",
  "env",
  "printenv",
  "uname",
  "hostname",
  "whoami",
  "id",
  "groups",
  "date",
  "uptime",
  "df",
  "du",
  "free",
  "ps",
  "top",
  "htop",
  "lsof",
  "netstat",
  "ss",
  "ip",
  "ifconfig",
  "ping",
  "traceroute",
  "nslookup",
  "dig",
  "host",
  "curl",
  "wget",
  "git",
  "npm",
  "node",
  "python",
  "python3",
  "ruby",
  "go",
  "cargo",
  "make",
  "cmake",
]);

// ============================================================================
// Public API
// ============================================================================

/**
 * Returns `true` if the command matches a known-dangerous pattern that should
 * always be blocked, regardless of the active permission policy.
 *
 * This check is applied by default even when no `ToolPermissionPolicy` is
 * configured, providing a baseline safety net for non-sandboxed Bash tools.
 */
export function isDangerousCommand(command: string): boolean {
  return DANGEROUS_BASH_PATTERNS.some((pattern) => pattern.test(command));
}

/**
 * Returns `true` if the command's first word is in the read-only command
 * allowlist.
 *
 * Use this to enforce a strict read-only policy (e.g. for plan/analysis-only
 * agents). Commands not in the list are considered potentially mutating.
 */
export function isReadOnlyCommand(command: string): boolean {
  const firstWord = command.trimStart().split(/\s+/)[0]?.toLowerCase() ?? "";
  return READ_ONLY_COMMANDS.has(firstWord);
}

/**
 * Normalises a raw shell command string into the `"verb:rest"` form used by
 * the Bash permission DSL.
 *
 * The DSL convention `Bash(git:*)` means "any shell command whose first word
 * is `git`". Because raw commands use spaces (`"git status"`) rather than
 * colons, this function converts `"git status --porcelain"` into
 * `"git:status --porcelain"` so that glob patterns like `git:*` match
 * correctly.
 *
 * Single-word commands (e.g. `"ls"`) are returned as-is.
 *
 * @example
 * normalizeBashCommand("git status")  // → "git:status"
 * normalizeBashCommand("npm install") // → "npm:install"
 * normalizeBashCommand("ls")          // → "ls"
 */
export function normalizeBashCommand(command: string): string {
  const trimmed = command.trimStart();
  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace === -1) return trimmed;
  return trimmed.slice(0, firstSpace) + ":" + trimmed.slice(firstSpace + 1);
}
