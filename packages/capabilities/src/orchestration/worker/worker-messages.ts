/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SessionRef } from "@agentrail/core";

export interface WorkerConfigMessage {
  pollIntervalMs?: number;
  fakeExecution?: "" | "echo";
}

/** Parent-to-worker initialization payload sent once after fork. */
export interface WorkerInitMessage {
  type: "init";
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionRef: SessionRef;
  dataDir: string;
  // biome-ignore lint/suspicious/noExplicitAny: Worker state is serialized
  runtimeConfig: any;
  workerConfig?: WorkerConfigMessage;
  /** Shared correlation ID for the request chain (root + all descendants). */
  chainId?: string;
  /** Sub-agent nesting depth within the multi-agent hierarchy. */
  depth?: number;
}

/** Parent-to-worker message that asks the worker to process queued input. */
export interface WorkerRunTurnMessage {
  type: "run_turn";
  requestId: string;
}

/** Parent-to-worker message that requests shutdown. */
export interface WorkerCloseMessage {
  type: "close";
  reason?: string;
}

/** Union of all messages accepted by the worker process. */
export type WorkerMessage = WorkerInitMessage | WorkerRunTurnMessage | WorkerCloseMessage;

/** Worker-to-parent result payload for a completed run-turn request. */
export interface WorkerResultMessage {
  type: "run_turn_result";
  requestId: string;
  // biome-ignore lint/suspicious/noExplicitAny: Result is serialized
  result: any;
}

/** Worker-to-parent event emitted when a managed-agent job starts. */
export interface WorkerJobStartedMessage {
  type: "job_started";
  jobId: string;
  inputIds: string[];
}

/** Worker-to-parent event emitted when a managed-agent job completes. */
export interface WorkerJobCompletedMessage {
  type: "job_completed";
  // biome-ignore lint/suspicious/noExplicitAny: Result is serialized
  result: any;
}

/** Worker-to-parent event emitted when the worker becomes idle. */
export interface WorkerIdleMessage {
  type: "idle";
}

/** Worker-to-parent error payload. */
export interface WorkerErrorMessage {
  type: "error";
  requestId?: string;
  error: string;
}

/** Worker-to-parent readiness signal emitted once initialization is complete. */
export interface WorkerReadyMessage {
  type: "ready";
}

/** Union of all messages emitted by the worker process back to its parent. */
export type ParentMessage =
  | WorkerReadyMessage
  | WorkerResultMessage
  | WorkerJobStartedMessage
  | WorkerJobCompletedMessage
  | WorkerIdleMessage
  | WorkerErrorMessage;
