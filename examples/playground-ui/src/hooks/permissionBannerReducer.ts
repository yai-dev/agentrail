/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

export type PermissionBlockedState = { toolName: string; reason?: string } | null;

/**
 * Pure reducer for the `permissionBlocked` banner state.
 * Exported for unit testing; use `setPermissionBlocked` in component code.
 */
export function applyPermissionEventForTest(
  state: PermissionBlockedState,
  event: { type: string; toolName?: string; reason?: string },
): PermissionBlockedState {
  if (event.type === "permission_request") {
    return { toolName: event.toolName ?? "", reason: event.reason };
  }
  if (event.type === "turn.complete" || event.type === "session.end") {
    return null;
  }
  return state;
}
