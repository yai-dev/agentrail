/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { resolveSessionRef } from "@agentrail/core";
import { defineAgent, type Message } from "@agentrail/core";
import { join } from "node:path";
import {
  type AgentInputEnvelope,
  type CreateManagedAgentInput,
  type ManagedAgentDeliveryResult,
  type OrchestrationMailboxState,
} from "../index.js";
import { createFilesystemOrchestrationStore } from "../orchestration-store.js";
import {
  type SubAgentRuntime,
  type SubagentWorkerConfig,
  type WorkerState,
} from "./agent-runtime.js";
import {
  type ParentMessage,
  type WorkerCloseMessage,
  type WorkerInitMessage,
  type WorkerMessage,
  type WorkerRunTurnMessage,
} from "./worker-messages.js";

/** Dependencies required to bootstrap a managed sub-agent worker process. */
export interface WorkerOptions {
  runtime: SubAgentRuntime;
}

let state: WorkerState | null = null;
let activeTurn: Promise<void> | null = null;
let activeRequestId: string | null = null;
let closeRequested = false;
const pendingRequestIds: string[] = [];
let pollTimer: NodeJS.Timeout | null = null;
let runtimeInstance: SubAgentRuntime | null = null;
let workerStore: ReturnType<typeof createWorkerStore> | null = null;
const DEFAULT_WORKER_CONFIG: SubagentWorkerConfig = {
  pollIntervalMs: 500,
  fakeExecution: "",
};

function getPollIntervalMs(): number {
  return requireState().workerConfig.pollIntervalMs;
}

/** Initializes IPC listeners and starts the managed sub-agent worker loop. */
export function initializeWorker(options: WorkerOptions): void {
  runtimeInstance = options.runtime;

  process.on("message", (message: WorkerMessage) => {
    void handleMessage(message);
  });
}

async function handleMessage(message: WorkerMessage): Promise<void> {
  try {
    switch (message.type) {
      case "init":
        await handleInit(message);
        return;
      case "run_turn":
        handleRunTurn(message);
        return;
      case "close":
        handleClose(message);
        return;
      default:
        return;
    }
  } catch (error) {
    send({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
      requestId: message.type === "run_turn" ? message.requestId : undefined,
    });
  }
}

async function handleInit(message: WorkerInitMessage): Promise<void> {
  workerStore = createWorkerStore(message.dataDir, message.sessionRef);
  state = {
    tenantId: message.tenantId,
    userId: message.userId,
    sessionId: message.sessionId,
    sessionRef: message.sessionRef,
    input: message.runtimeConfig.input as CreateManagedAgentInput,
    history: await workerStore.loadHistory(message.runtimeConfig.input.agentId),
    workerConfig: {
      pollIntervalMs: message.workerConfig?.pollIntervalMs ?? DEFAULT_WORKER_CONFIG.pollIntervalMs,
      fakeExecution: message.workerConfig?.fakeExecution ?? DEFAULT_WORKER_CONFIG.fakeExecution,
    },
  };
  send({ type: "ready" });
  schedulePoll();
}

function handleRunTurn(message: WorkerRunTurnMessage): void {
  pendingRequestIds.push(message.requestId);
  ensureDrainLoop();
}

function handleClose(_message: WorkerCloseMessage): void {
  closeRequested = true;
  clearPollTimer();
  if (!activeTurn) {
    process.exit(0);
  }
}

function ensureDrainLoop(): void {
  clearPollTimer();
  if (activeTurn) {
    return;
  }

  activeTurn = drainTurns()
    .catch((error) => {
      send({
        type: "error",
        requestId: activeRequestId ?? undefined,
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      activeTurn = null;
      activeRequestId = null;
      if (closeRequested) {
        process.exit(0);
      }
    });
}

async function drainTurns(): Promise<void> {
  while (true) {
    const requestId = pendingRequestIds.shift();
    activeRequestId = requestId ?? null;
    const result = await runTurn(requestId);
    activeRequestId = null;
    if (!result) {
      if (pendingRequestIds.length > 0) {
        continue;
      }

      send({ type: "idle" });
      schedulePoll();
      return;
    }

    send({
      type: "job_completed",
      result,
    });

    if (requestId) {
      send({
        type: "run_turn_result",
        requestId,
        result,
      });
    }

    if (pendingRequestIds.length > 0) {
      continue;
    }

    if (result.outcome === "completed" && (await hasPendingMailboxWorkSafely())) {
      continue;
    }

    send({ type: "idle" });
    schedulePoll();
    return;
  }
}

async function runTurn(requestId?: string): Promise<ManagedAgentDeliveryResult | null> {
  const currentState = requireState();
  const currentStore = requireWorkerStore();
  const currentRuntime = requireRuntime();
  let mailboxState: OrchestrationMailboxState = {
    processedEventCount: 0,
    closeRequested: null,
  };
  let mailboxEvents: Awaited<ReturnType<typeof currentStore.loadMailboxEvents>> = [];
  let inputs: AgentInputEnvelope[] = [];
  let jobId = `job:error:${Date.now()}`;

  try {
    mailboxState = await currentStore.loadMailboxState(currentState.input.agentId);
    mailboxEvents = await currentStore.loadMailboxEvents(currentState.input.agentId);
    const unprocessedEvents = mailboxEvents.slice(mailboxState.processedEventCount);

    inputs = unprocessedEvents
      .filter((event): event is Extract<typeof event, { type: "input_enqueued" }> => {
        return event.type === "input_enqueued";
      })
      .map((event) => ({
        id: event.inputId,
        agentId: event.agentId,
        payload: event.payload,
        queuedAt: event.occurredAt,
      }));

    if (inputs.length === 0) {
      if (requestId) {
        send({
          type: "run_turn_result",
          requestId,
          result: {
            jobId: `job:noop:${Date.now()}`,
            consumedInputIds: [],
            outcome: "completed",
          },
        });
      }
      return null;
    }

    jobId = `job:${inputs[0]?.id}:${Date.now()}`;
    send({
      type: "job_started",
      jobId,
      inputIds: inputs.map((input) => input.id),
    });

    const tools = await currentRuntime.buildTools(currentState.input);
    const agent = defineAgent({
      id: currentState.input.agentId,
      name: `Orchestration Sub-Agent: ${currentState.input.role}`,
      model: currentRuntime.getModelConfig(),
      system: currentRuntime.buildSystemPrompt(currentState.input),
      tools,
      maxTokens: 8192,
      maxTurns: 20,
    });
    const result = await executeTurn(currentState, inputs, agent, currentRuntime);

    currentState.history.push(...result.messages);
    await currentStore.writeHistory(currentState.input.agentId, currentState.history);
    await currentStore.writeMailboxState(currentState.input.agentId, {
      processedEventCount: mailboxEvents.length,
      closeRequested: closeRequested
        ? {
            occurredAt: new Date().toISOString(),
          }
        : null,
    });
    return {
      jobId,
      consumedInputIds: inputs.map((input) => input.id),
      outcome: "completed",
      outputText: result.outputText,
    };
  } catch (error) {
    try {
      await currentStore.writeMailboxState(currentState.input.agentId, {
        processedEventCount: mailboxState.processedEventCount,
        closeRequested: closeRequested
          ? {
              occurredAt: new Date().toISOString(),
            }
          : null,
      });
    } catch {
      // Keep the original turn failure as the surfaced error.
    }

    return {
      jobId,
      consumedInputIds: inputs.map((input) => input.id),
      outcome: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function executeTurn(
  currentState: WorkerState,
  inputs: AgentInputEnvelope[],
  agent: ReturnType<typeof defineAgent>,
  runtime: SubAgentRuntime,
): Promise<{ outputText: string; messages: Message[] }> {
  if (currentState.workerConfig.fakeExecution === "echo") {
    return {
      outputText: inputs.map((input) => String(input.payload.prompt ?? input.id)).join("\n"),
      messages: [],
    };
  }

  const transformContext = runtime.buildTransformContext?.(
    currentState.tenantId,
    currentState.userId,
    currentState.sessionId,
    currentState.sessionRef,
  );

  const result = await agent.invoke(formatInputs(inputs), {
    messages: currentState.history,
    ...(transformContext ? { transformContext } : {}),
  });

  return {
    outputText: result.text,
    messages: result.messages,
  };
}

function formatInputs(inputs: AgentInputEnvelope[]): string {
  return inputs
    .map((input) =>
      [
        "[Orchestration Input]",
        `input_id: ${input.id}`,
        `agent_id: ${input.agentId}`,
        `queued_at: ${input.queuedAt}`,
        "payload:",
        JSON.stringify(input.payload, null, 2),
      ].join("\n"),
    )
    .join("\n\n---\n\n");
}

async function hasPendingMailboxWork(): Promise<boolean> {
  const currentState = requireState();
  const currentStore = requireWorkerStore();
  const [mailboxState, mailboxEvents] = await Promise.all([
    currentStore.loadMailboxState(currentState.input.agentId),
    currentStore.loadMailboxEvents(currentState.input.agentId),
  ]);

  return mailboxEvents
    .slice(mailboxState.processedEventCount)
    .some((event) => event.type === "input_enqueued");
}

async function hasPendingMailboxWorkSafely(): Promise<boolean> {
  try {
    return await hasPendingMailboxWork();
  } catch {
    return false;
  }
}

function schedulePoll(): void {
  if (closeRequested || pollTimer) {
    return;
  }

  pollTimer = setTimeout(() => {
    pollTimer = null;
    void pollForWork();
  }, getPollIntervalMs());
}

async function pollForWork(): Promise<void> {
  if (closeRequested || activeTurn) {
    schedulePoll();
    return;
  }

  if (await hasPendingMailboxWork()) {
    ensureDrainLoop();
    return;
  }

  schedulePoll();
}

function clearPollTimer(): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function requireState(): WorkerState {
  if (!state) {
    throw new Error("Sub-agent worker has not been initialized");
  }
  return state;
}

function requireRuntime(): SubAgentRuntime {
  if (!runtimeInstance) {
    throw new Error("Sub-agent runtime has not been initialized");
  }
  return runtimeInstance;
}

function requireWorkerStore(): ReturnType<typeof createWorkerStore> {
  if (!workerStore) {
    throw new Error("Sub-agent worker storage has not been initialized");
  }
  return workerStore;
}

function createWorkerStore(dataDir: string, sessionRef: WorkerInitMessage["sessionRef"]) {
  const { tenantId, sessionId } = resolveSessionRef(sessionRef);
  const sessionDir = join(dataDir, "tenants", tenantId, "sessions", sessionId);
  const store = createFilesystemOrchestrationStore(sessionDir);

  return {
    loadMailboxState: (agentId: string) => store.loadMailboxState(agentId),
    loadMailboxEvents: (agentId: string) => store.loadMailboxEvents(agentId),
    writeMailboxState: (agentId: string, state: OrchestrationMailboxState) =>
      store.writeMailboxState(agentId, state),
    async loadHistory(agentId: string): Promise<Message[]> {
      const history = await store.loadAgentHistory(agentId);
      return history as Message[];
    },
    writeHistory: (agentId: string, history: Message[]) =>
      store.writeAgentHistory(agentId, history),
  };
}

function send(message: ParentMessage): void {
  if (typeof process.send === "function") {
    process.send(message);
  }
}
