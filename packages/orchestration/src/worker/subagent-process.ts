/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import type {
  AgentInputEnvelope,
  ManagedAgentDeliveryResult,
} from "../types.js";
import type {
  CreateManagedAgentInput,
  ManagedAgentEventHandlers,
  ManagedAgentInstance,
} from "../orchestration-manager.js";
import type { SubagentWorkerConfig } from "./agent-runtime.js";

interface WorkerReadyMessage {
  type: "ready";
}

interface WorkerResultMessage {
  type: "run_turn_result";
  requestId: string;
  result: ManagedAgentDeliveryResult;
}

interface WorkerJobStartedMessage {
  type: "job_started";
  jobId: string;
  inputIds: string[];
}

interface WorkerJobCompletedMessage {
  type: "job_completed";
  result: ManagedAgentDeliveryResult;
}

interface WorkerIdleMessage {
  type: "idle";
}

interface WorkerErrorMessage {
  type: "error";
  requestId?: string;
  error: string;
}

type WorkerResponseMessage =
  | WorkerReadyMessage
  | WorkerResultMessage
  | WorkerJobStartedMessage
  | WorkerJobCompletedMessage
  | WorkerIdleMessage
  | WorkerErrorMessage;

interface ChildProcessLike {
  send(message: unknown): void;
  on(event: "message", listener: (message: WorkerResponseMessage) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  kill?(signal?: NodeJS.Signals | number): boolean;
  stderr?: NodeJS.ReadableStream | null;
}

export const DEFAULT_SUBAGENT_READY_TIMEOUT_MS = 5_000;

export interface CreateSubAgentProcessInput {
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionDir: string;
  input: CreateManagedAgentInput;
  workerPath: string;
  // biome-ignore lint/suspicious/noExplicitAny: Runtime config is serialized
  runtimeConfig: any;
  workerConfig?: Partial<SubagentWorkerConfig>;
  readyTimeoutMs?: number;
}

export async function createSubAgentProcess(
  options: CreateSubAgentProcessInput,
): Promise<ManagedAgentInstance> {
  const child = fork(options.workerPath, [], {
    cwd: resolveWorkerCwd(options.workerPath),
    execArgv: resolveWorkerExecArgv(),
    env: process.env,
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });

  return createManagedSubAgentInstance(child, options);
}

export async function createManagedSubAgentInstance(
  child: ChildProcessLike,
  options: CreateSubAgentProcessInput,
): Promise<ManagedAgentInstance> {
  const pending = new Map<
    string,
    {
      resolve: (result: ManagedAgentDeliveryResult) => void;
      reject: (error: Error) => void;
    }
  >();
  let handlers: ManagedAgentEventHandlers | undefined;
  const bufferedEvents: WorkerResponseMessage[] = [];
  const recentStderr: string[] = [];
  const readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_SUBAGENT_READY_TIMEOUT_MS;

  child.stderr?.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (!text) {
      return;
    }

    recentStderr.push(text);
    if (recentStderr.length > 5) {
      recentStderr.shift();
    }
  });

  const rejectPending = (error: Error) => {
    for (const request of pending.values()) {
      request.reject(error);
    }
    pending.clear();
  };
  const buildWorkerError = (message: string): Error => {
    const stderrSuffix =
      recentStderr.length > 0
        ? ` stderr=${JSON.stringify(recentStderr.join("\n"))}`
        : "";
    return new Error(`${message}${stderrSuffix}`);
  };

  let settleReady!: () => void;
  let failReady!: (error: Error) => void;
  let readySettled = false;
  let readyTimeout: ReturnType<typeof setTimeout> | undefined;
  const markReadyResolved = () => {
    if (readySettled) {
      return;
    }
    readySettled = true;
    if (readyTimeout) {
      clearTimeout(readyTimeout);
    }
    settleReady();
  };
  const markReadyRejected = (error: Error) => {
    if (readySettled) {
      return;
    }
    readySettled = true;
    if (readyTimeout) {
      clearTimeout(readyTimeout);
    }
    failReady(error);
  };

  const ready = new Promise<void>((resolve, reject) => {
    settleReady = resolve;
    failReady = reject;
    child.on("message", (message: WorkerResponseMessage) => {
      if (!message || typeof message !== "object") {
        return;
      }

      if (message.type === "ready") {
        markReadyResolved();
        return;
      }

      if (message.type === "run_turn_result") {
        const request = pending.get(message.requestId);
        if (request) {
          pending.delete(message.requestId);
          request.resolve(message.result);
        }
        return;
      }

      if (message.type === "job_started") {
        if (!handlers) {
          bufferedEvents.push(message);
          return;
        }
        void handlers?.onJobStarted?.({
          jobId: message.jobId,
          inputIds: message.inputIds,
        });
        return;
      }

      if (message.type === "job_completed") {
        if (!handlers) {
          bufferedEvents.push(message);
          return;
        }
        void handlers?.onJobCompleted?.(message.result);
        return;
      }

      if (message.type === "idle") {
        if (!handlers) {
          bufferedEvents.push(message);
          return;
        }
        void handlers?.onIdle?.();
        return;
      }

      if (message.type === "error") {
        if (message.requestId) {
          const request = pending.get(message.requestId);
          if (request) {
            pending.delete(message.requestId);
            request.reject(new Error(message.error));
          }
          return;
        }

        const error = buildWorkerError(message.error);
        rejectPending(error);
        markReadyRejected(error);
      }
    });
    child.on("error", (error) => {
      rejectPending(error);
      markReadyRejected(error);
    });
    child.on("exit", (code, signal) => {
      const error = buildWorkerError(
        `Sub-agent worker exited before completion (code=${code}, signal=${signal})`,
      );
      rejectPending(error);
      markReadyRejected(error);
    });
  });
  readyTimeout = setTimeout(() => {
    const error = buildWorkerError(
      `Sub-agent worker did not become ready within ${readyTimeoutMs}ms`,
    );
    rejectPending(error);
    terminateChild(child);
    markReadyRejected(error);
  }, readyTimeoutMs);
  if (options.readyTimeoutMs === undefined) {
    readyTimeout.unref?.();
  }

  safeSend(child, {
    type: "init",
    tenantId: options.tenantId,
    userId: options.userId,
    sessionId: options.sessionId,
    sessionDir: options.sessionDir,
    runtimeConfig: {
      ...(options.runtimeConfig ?? {}),
      input: options.runtimeConfig?.input ?? options.input,
    },
    workerConfig: options.workerConfig,
  }, recentStderr);
  await ready;

  return {
    autonomousDelivery: true,
    subscribe(nextHandlers: ManagedAgentEventHandlers): void {
      handlers = nextHandlers;
      for (const event of bufferedEvents.splice(0)) {
        if (event.type === "job_started") {
          void handlers.onJobStarted?.({
            jobId: event.jobId,
            inputIds: event.inputIds,
          });
        } else if (event.type === "job_completed") {
          void handlers.onJobCompleted?.(event.result);
        } else if (event.type === "idle") {
          void handlers.onIdle?.();
        }
      }
    },
    async deliverInput(
      _envelope: AgentInputEnvelope,
    ): Promise<ManagedAgentDeliveryResult> {
      const requestId = randomUUID();

      return new Promise<ManagedAgentDeliveryResult>((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        safeSend(child, {
          type: "run_turn",
          requestId,
        }, recentStderr);
      });
    },

    async close(reason?: string): Promise<void> {
      const closed = new Promise<void>((resolve) => {
        child.once("exit", () => {
          resolve();
        });
      });
      safeSend(child, {
        type: "close",
        reason,
      }, recentStderr);
      await closed;
    },
  };
}

export function resolveWorkerExecArgv(
  parentExecArgv: string[] = process.execArgv,
): string[] {
  const nextExecArgv: string[] = [];

  for (let index = 0; index < parentExecArgv.length; index += 1) {
    const arg = parentExecArgv[index];

    if (!arg) {
      continue;
    }

    if (
      arg === "--enable-source-maps" ||
      arg === "--no-warnings" ||
      arg.startsWith("--import=") ||
      arg.startsWith("--loader=") ||
      arg.startsWith("--require=") ||
      arg.startsWith("--conditions=")
    ) {
      nextExecArgv.push(arg);
      continue;
    }

    if (
      arg === "--import" ||
      arg === "--loader" ||
      arg === "--require" ||
      arg === "-r" ||
      arg === "--conditions"
    ) {
      const value = parentExecArgv[index + 1];
      if (value) {
        nextExecArgv.push(arg, value);
        index += 1;
      }
    }
  }

  return nextExecArgv;
}

export function resolveWorkerCwd(
  _workerPath: string,
  parentCwd: string = process.cwd(),
): string {
  return parentCwd;
}

function safeSend(
  child: ChildProcessLike,
  message: unknown,
  recentStderr: string[],
): void {
  try {
    child.send(message);
  } catch (error) {
    const stderrSuffix =
      recentStderr.length > 0
        ? ` stderr=${JSON.stringify(recentStderr.join("\n"))}`
        : "";
    const baseMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Sub-agent worker IPC send failed: ${baseMessage}${stderrSuffix}`);
  }
}

function terminateChild(child: ChildProcessLike): void {
  try {
    child.kill?.("SIGTERM");
  } catch {
    // Best-effort shutdown for hung worker processes.
  }
}
