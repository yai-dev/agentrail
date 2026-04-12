/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ============================================================================
// Dangerous path definitions
// ============================================================================

/**
 * Absolute directory paths that non-sandboxed file tools must not access.
 * Checked after symlink resolution so that indirect references are caught.
 */
export const DANGEROUS_PATHS: readonly string[] = [
  "/etc",
  "/sys",
  "/proc",
  "/dev",
  "/boot",
  "/root",
  "/run/secrets",
];

/**
 * File base-names that are blocked regardless of their directory.
 * Matched case-sensitively against the last path component.
 */
export const DANGEROUS_FILES: readonly string[] = [
  ".env",
  ".env.local",
  ".env.production",
  "id_rsa",
  "id_ed25519",
  "id_ecdsa",
  "id_dsa",
  ".npmrc",
  ".netrc",
  ".pypirc",
  "credentials",
  "credential",
];

/**
 * Home-relative directories that are blocked (e.g. `~/.ssh`).
 * Expanded at runtime using `os.homedir()`.
 */
const DANGEROUS_HOME_DIRS: readonly string[] = [
  ".ssh",
  ".aws",
  ".gnupg",
  ".config/gcloud",
  ".azure",
  ".docker",
];

// ============================================================================
// Path resolution helpers
// ============================================================================

function expandedDangerousDirs(): string[] {
  const home = os.homedir();
  return [...DANGEROUS_PATHS, ...DANGEROUS_HOME_DIRS.map((d) => path.join(home, d))];
}

/**
 * Resolves `filePath` to its real path, handling the case where the file does
 * not yet exist (common for `Write` on new files).
 *
 * Strategy for non-existent paths:
 * 1. Walk up the directory tree to find the nearest existing ancestor.
 * 2. Resolve that ancestor's real path (resolves symlinks).
 * 3. Re-append the remaining (non-existent) path components.
 *
 * This prevents attacks where an existing parent directory is a symlink that
 * points outside the workspace.
 */
function resolveRealPath(filePath: string): string {
  const absolute = path.resolve(filePath);

  // Fast path: file/dir already exists
  try {
    return fs.realpathSync(absolute);
  } catch {
    // Not found — walk up to find the nearest existing ancestor
  }

  const parts = absolute.split(path.sep);
  let existingAncestor: string = path.sep;
  let remainingParts: string[] = [];

  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = parts.slice(0, i + 1).join(path.sep) || path.sep;
    try {
      fs.accessSync(candidate);
      existingAncestor = candidate;
      remainingParts = parts.slice(i + 1);
      break;
    } catch {
      // Not found, keep walking up
    }
  }

  try {
    const resolvedAncestor = fs.realpathSync(existingAncestor);
    return path.join(resolvedAncestor, ...remainingParts);
  } catch {
    // Fallback: return the absolute path without symlink resolution
    return path.join(existingAncestor, ...remainingParts);
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Returns `true` if `filePath` is considered safe for non-sandboxed file tool
 * access.
 *
 * A path is considered **unsafe** if:
 * - Its resolved form is inside (or equal to) a `DANGEROUS_PATHS` directory.
 * - Its file name matches a `DANGEROUS_FILES` entry.
 * - Its resolved form is inside a dangerous home directory (e.g. `~/.ssh`).
 */
export function isPathSafe(filePath: string): boolean {
  const resolved = resolveRealPath(filePath);
  const basename = path.basename(resolved);

  if (DANGEROUS_FILES.includes(basename)) return false;

  const dangerousDirs = expandedDangerousDirs();
  for (const dangerous of dangerousDirs) {
    if (resolved === dangerous || resolved.startsWith(dangerous + path.sep)) {
      return false;
    }
  }

  return true;
}

/**
 * Verifies that `filePath` is anchored within `rootDir`.
 *
 * For existing paths, resolves symlinks before checking containment.
 * For non-existing paths, resolves the nearest existing ancestor's real path
 * and re-appends remaining components (see `resolveRealPath`).
 *
 * @throws {Error} if `filePath` would escape `rootDir`.
 */
export function workspaceAnchor(filePath: string, rootDir: string): void {
  const resolvedRoot = fs.realpathSync(path.resolve(rootDir));
  const resolvedFile = resolveRealPath(filePath);

  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;

  if (resolvedFile !== resolvedRoot && !resolvedFile.startsWith(rootWithSep)) {
    throw new Error(
      `Path "${filePath}" resolves to "${resolvedFile}" which is outside the allowed root "${resolvedRoot}"`,
    );
  }
}
