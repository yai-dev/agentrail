/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPermissionEventForTest,
  type PermissionBlockedState,
} from "../src/hooks/permissionBannerReducer.js";

test("permission_request sets permissionBlocked", () => {
  const next = applyPermissionEventForTest(null, {
    type: "permission_request",
    toolName: "Bash",
    reason: "denied by policy",
  });
  assert.deepStrictEqual(next, { toolName: "Bash", reason: "denied by policy" });
});

test("permission_request without reason sets permissionBlocked with no reason field", () => {
  const next = applyPermissionEventForTest(null, {
    type: "permission_request",
    toolName: "Write",
  });
  assert.deepStrictEqual(next, { toolName: "Write", reason: undefined });
});

test("turn.complete clears permissionBlocked", () => {
  const initial: PermissionBlockedState = { toolName: "Bash", reason: "denied" };
  const next = applyPermissionEventForTest(initial, { type: "turn.complete" });
  assert.strictEqual(next, null);
});

test("session.end clears permissionBlocked", () => {
  const initial: PermissionBlockedState = { toolName: "Bash" };
  const next = applyPermissionEventForTest(initial, { type: "session.end" });
  assert.strictEqual(next, null);
});

test("unrelated events leave permissionBlocked unchanged", () => {
  const initial: PermissionBlockedState = { toolName: "Bash" };
  const next = applyPermissionEventForTest(initial, { type: "tool.before" });
  assert.strictEqual(next, initial);
});
