/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

export interface WorkerConfigMessage {
  pollIntervalMs?: number;
  fakeExecution?: "" | "echo";
}

export interface WorkerInitMessage {
  type: "init";
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionDir: string;
  // biome-ignore lint/suspicious/noExplicitAny: Worker state is serialized
  runtimeConfig: any;
  workerConfig?: WorkerConfigMessage;
}

export interface WorkerRunTurnMessage {
  type: "run_turn";
  requestId: string;
}

export interface WorkerCloseMessage {
  type: "close";
  reason?: string;
}

export type WorkerMessage =
  | WorkerInitMessage
  | WorkerRunTurnMessage
  | WorkerCloseMessage;

export interface WorkerResultMessage {
  type: "run_turn_result";
  requestId: string;
  // biome-ignore lint/suspicious/noExplicitAny: Result is serialized
  result: any;
}

export interface WorkerJobStartedMessage {
  type: "job_started";
  jobId: string;
  inputIds: string[];
}

export interface WorkerJobCompletedMessage {
  type: "job_completed";
  // biome-ignore lint/suspicious/noExplicitAny: Result is serialized
  result: any;
}

export interface WorkerIdleMessage {
  type: "idle";
}

export interface WorkerErrorMessage {
  type: "error";
  requestId?: string;
  error: string;
}

export interface WorkerReadyMessage {
  type: "ready";
}

export type ParentMessage =
  | WorkerReadyMessage
  | WorkerResultMessage
  | WorkerJobStartedMessage
  | WorkerJobCompletedMessage
  | WorkerIdleMessage
  | WorkerErrorMessage;
