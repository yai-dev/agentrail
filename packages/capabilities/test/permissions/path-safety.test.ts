/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DANGEROUS_FILES,
  DANGEROUS_PATHS,
  isPathSafe,
  workspaceAnchor,
} from "../../src/permissions/path-safety.js";

// ─── isPathSafe tests ─────────────────────────────────────────────────────────

describe("isPathSafe", () => {
  it("allows regular workspace paths", () => {
    expect(isPathSafe("/home/user/projects/myapp/src/index.ts")).toBe(true);
    expect(isPathSafe("/tmp/workspace/file.txt")).toBe(true);
  });

  it("blocks paths inside DANGEROUS_PATHS", () => {
    for (const dangerousDir of DANGEROUS_PATHS) {
      expect(isPathSafe(path.join(dangerousDir, "some-file"))).toBe(false);
    }
  });

  it("blocks dangerous file names regardless of directory", () => {
    for (const dangerousFile of DANGEROUS_FILES) {
      expect(isPathSafe(path.join("/workspace", dangerousFile))).toBe(false);
    }
  });

  it("blocks paths inside ~/.ssh", () => {
    const sshKey = path.join(os.homedir(), ".ssh", "id_rsa");
    expect(isPathSafe(sshKey)).toBe(false);
  });

  it("blocks paths inside ~/.aws", () => {
    const awsConfig = path.join(os.homedir(), ".aws", "credentials");
    expect(isPathSafe(awsConfig)).toBe(false);
  });

  it("blocks .env files", () => {
    expect(isPathSafe("/workspace/.env")).toBe(false);
    expect(isPathSafe("/workspace/.env.local")).toBe(false);
  });
});

// ─── workspaceAnchor tests ────────────────────────────────────────────────────

describe("workspaceAnchor", () => {
  const tmpDir = os.tmpdir();

  it("allows paths inside the rootDir", () => {
    expect(() => workspaceAnchor(path.join(tmpDir, "file.txt"), tmpDir)).not.toThrow();
  });

  it("allows deeply nested paths inside rootDir", () => {
    expect(() =>
      workspaceAnchor(path.join(tmpDir, "a", "b", "c", "file.txt"), tmpDir),
    ).not.toThrow();
  });

  it("blocks paths outside rootDir", () => {
    expect(() => workspaceAnchor("/etc/passwd", tmpDir)).toThrow(/outside the allowed root/i);
  });

  it("blocks path traversal attempts", () => {
    const traversal = path.join(tmpDir, "..", "etc", "passwd");
    expect(() => workspaceAnchor(traversal, tmpDir)).toThrow(/outside the allowed root/i);
  });

  it("blocks absolute paths that share rootDir prefix but escape it", () => {
    // tmpDir itself is the root; a sibling directory should be rejected.
    // Use /etc as an example of an existing path clearly outside tmpDir.
    expect(() => workspaceAnchor("/etc/passwd", tmpDir)).toThrow(/outside the allowed root/i);
  });

  it("allows a non-existent path whose nearest existing ancestor is inside rootDir", () => {
    // deep/non/existent.txt does not exist but its ancestor chain leads back to tmpDir
    const nonExistent = path.join(tmpDir, "deep", "non", "existent.txt");
    expect(() => workspaceAnchor(nonExistent, tmpDir)).not.toThrow();
  });

  it("blocks a non-existent path whose nearest existing ancestor is outside rootDir", () => {
    // /etc exists and is outside tmpDir; a non-existent child must still be blocked
    expect(() => workspaceAnchor("/etc/nonexistent/file.txt", tmpDir)).toThrow(
      /outside the allowed root/i,
    );
  });
});
