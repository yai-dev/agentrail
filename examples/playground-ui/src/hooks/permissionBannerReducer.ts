/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

export type PermissionBlockedState = { toolName: string; reason?: string } | null;

/**
 * Pure reducer for the `permissionBlocked` banner state.
 * Exported for unit testing only; do not call from production code.
 *
 * In App.tsx the two clearing events are handled in separate if-else branches:
 * - `session.end` is cleared inside the existing session.end handler
 * - `turn.complete` is cleared in its own branch
 * This reducer unifies them for test purposes.
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
