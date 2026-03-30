/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { fork } from "node:child_process";
import { dirname } from "node:path";
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
  once(event: "error", listener: (error: Error) => void): this;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  stderr?: NodeJS.ReadableStream | null;
}

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
}

export async function createSubAgentProcess(
  options: CreateSubAgentProcessInput,
): Promise<ManagedAgentInstance> {
  const child = fork(options.workerPath, [], {
    cwd: dirname(options.workerPath),
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

  const ready = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.on("message", (message: WorkerResponseMessage) => {
      if (!message || typeof message !== "object") {
        return;
      }

      if (message.type === "ready") {
        resolve();
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

        reject(new Error(message.error));
      }
    });
    child.once("exit", (code, signal) => {
      const stderrSuffix =
        recentStderr.length > 0
          ? ` stderr=${JSON.stringify(recentStderr.join("\n"))}`
          : "";
      const error = new Error(
        `Sub-agent worker exited before completion (code=${code}, signal=${signal})${stderrSuffix}`,
      );
      for (const request of pending.values()) {
        request.reject(error);
      }
      pending.clear();
    });
  });

  child.send({
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
  });
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
        child.send({
          type: "run_turn",
          requestId,
        });
      });
    },

    async close(reason?: string): Promise<void> {
      const closed = new Promise<void>((resolve) => {
        child.once("exit", () => {
          resolve();
        });
      });
      child.send({
        type: "close",
        reason,
      });
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
