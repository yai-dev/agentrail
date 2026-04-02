/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { randomUUID } from "node:crypto";

import { OrchestrationStore } from "./orchestration-store.js";
import {
  applyOrchestrationEvent,
  cloneOrchestrationSnapshot,
} from "./recovery.js";
import {
  cloneAgent,
  cloneWait,
  createDisplayName,
  DISPLAY_NAME_WORDS,
  getWaitTargetAgentIds,
  normalizeDeliveryResult,
  normalizeWaitInput,
} from "./orchestration-manager-helpers.js";
import type {
  AgentInputEnvelope,
  CloseAgentInput,
  ManagedAgentDeliveryResult,
  OrchestrationAgent,
  OrchestrationEvent,
  OrchestrationRun,
  OrchestrationSnapshot,
  RemoveInputInput,
  RunStatus,
  SpawnAgentInput,
  WaitAgentInput,
  WaitCondition,
} from "./types.js";

export interface ManagedAgentInstance {
  deliverInput(
    input: AgentInputEnvelope,
  ): Promise<ManagedAgentDeliveryResult | void>;
  close(reason?: string): Promise<void>;
  autonomousDelivery?: boolean;
  subscribe?(handlers: ManagedAgentEventHandlers): void;
}

export interface ManagedAgentEventHandlers {
  onJobStarted?: (job: {
    jobId: string;
    inputIds: string[];
  }) => void | Promise<void>;
  onJobCompleted?: (
    result: ManagedAgentDeliveryResult,
  ) => void | Promise<void>;
  onIdle?: () => void | Promise<void>;
}

export interface CreateManagedAgentInput {
  agentId: string;
  runId: string;
  role: string;
  taskId: string;
}

export interface OrchestrationAgentFactory {
  createAgent(input: CreateManagedAgentInput): Promise<ManagedAgentInstance>;
}

export interface StartRunInput {
  runId: string;
  initialTask: {
    id: string;
    kind: string;
    input: Record<string, unknown>;
  };
}

export interface OrchestrationManagerOptions {
  sessionDir: string;
  runtime: OrchestrationAgentFactory;
  now?: () => string;
}

export interface OrchestrationManagerEvent {
  event: OrchestrationEvent;
  snapshot: OrchestrationSnapshot;
}

interface WaitHandle {
  promise: Promise<WaitCondition>;
  resolve: (wait: WaitCondition) => void;
}

export class OrchestrationManager {
  static async create(
    options: OrchestrationManagerOptions,
  ): Promise<OrchestrationManager> {
    const manager = new OrchestrationManager(options);
    await manager.initialize();
    return manager;
  }

  private snapshot: OrchestrationSnapshot = {
    runs: {},
    tasks: {},
    agents: {},
    waits: {},
    queuedInputs: [],
  };

  private readonly listeners = new Set<
    (event: OrchestrationManagerEvent) => void
  >();
  private readonly activeAgents = new Map<string, ManagedAgentInstance>();
  private readonly deliveryChains = new Map<string, Promise<void>>();
  private readonly eventChains = new Map<string, Promise<void>>();
  private readonly closeChains = new Map<string, Promise<void>>();
  private readonly closeRequestedAgents = new Set<string>();
  private readonly inFlightInputIds = new Set<string>();
  private readonly waitHandles = new Map<string, WaitHandle>();
  private readonly sessionDir: string;
  private readonly runtime: OrchestrationAgentFactory;
  private readonly now: () => string;

  private constructor(options: OrchestrationManagerOptions) {
    this.sessionDir = options.sessionDir;
    this.runtime = options.runtime;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  subscribe(
    listener: (event: OrchestrationManagerEvent) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): OrchestrationSnapshot {
    return cloneOrchestrationSnapshot(this.snapshot);
  }

  async startRun(input: StartRunInput): Promise<void> {
    const existingRun = this.snapshot.runs[input.runId];

    if (existingRun) {
      return;
    }

    await this.recordEvent({
      eventId: this.createEventId(),
      type: "run_started",
      occurredAt: this.now(),
      runId: input.runId,
      initialTask: input.initialTask,
    });
  }

  async spawnAgent(input: SpawnAgentInput): Promise<OrchestrationAgent> {
    const run = this.getActiveRun(input.runId);
    const taskId = input.taskId ?? run.initialTaskId;
    const normalizedInput: SpawnAgentInput = {
      ...input,
      taskId,
    };
    this.requireTask(taskId);
    const existingAgent = this.snapshot.agents[normalizedInput.id];

    if (existingAgent) {
      if (
        existingAgent.taskId !== normalizedInput.taskId ||
        existingAgent.role !== normalizedInput.role ||
        (normalizedInput.displayName !== undefined &&
          existingAgent.displayName !== normalizedInput.displayName)
      ) {
        throw new Error(
          `Orchestration agent ${normalizedInput.id} already exists with taskId ${existingAgent.taskId}, role ${existingAgent.role}, and displayName ${existingAgent.displayName ?? "unknown"}`,
        );
      }

      if (
        existingAgent.status !== "closed" &&
        !this.activeAgents.has(existingAgent.id)
      ) {
        await this.attachAgent(existingAgent);
        this.resumeQueuedInputsForAgent(existingAgent.id);
      }

      return cloneAgent(existingAgent);
    }

    normalizedInput.displayName =
      normalizedInput.displayName ??
      this.generateAgentDisplayName(run.id, normalizedInput.id, normalizedInput.role);

    await this.recordEvent({
      eventId: this.createEventId(),
      type: "agent_spawned",
      occurredAt: this.now(),
      runId: run.id,
      agent: normalizedInput,
    });

    const agent = this.snapshot.agents[normalizedInput.id];

    if (!agent) {
      throw new Error(`Failed to create agent ${normalizedInput.id}`);
    }

    await this.attachAgent(agent);
    return cloneAgent(agent);
  }

  async sendInput(input: {
    id: string;
    agentId: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const agent = this.requireAgent(input.agentId);
    const run = this.getActiveRun(agent.runId);

    if (agent.status === "closed") {
      throw new Error(`Agent ${input.agentId} is already closed`);
    }
    if (agent.status === "closing") {
      throw new Error(`Agent ${input.agentId} is closing`);
    }

    const queuedAt = this.now();
    await this.recordEvent({
      eventId: this.createEventId(),
      type: "agent_input_queued",
      occurredAt: queuedAt,
      runId: run.id,
      input,
    });
    await OrchestrationStore.appendMailboxEvent(this.sessionDir, input.agentId, {
      eventId: this.createEventId(),
      type: "input_enqueued",
      agentId: input.agentId,
      occurredAt: queuedAt,
      inputId: input.id,
      payload: input.payload,
    });

    const envelope = {
      id: input.id,
      agentId: input.agentId,
      payload: input.payload,
      queuedAt,
    };
    const instance = this.activeAgents.get(input.agentId);

    if (instance?.autonomousDelivery) {
      await instance.deliverInput(envelope);
      return;
    }

    await this.scheduleQueuedDelivery(input.agentId);
  }

  async waitForAgents(input: WaitAgentInput): Promise<WaitCondition> {
    const primaryAgent = this.requireAgent(input.agentId);
    const run = this.getActiveRun(primaryAgent.runId);
    const normalizedWait = normalizeWaitInput(input);

    for (const agentId of getWaitTargetAgentIds(normalizedWait)) {
      this.requireAgent(agentId);
    }

    const existingWait = this.snapshot.waits[normalizedWait.id];

    if (existingWait) {
      if (existingWait.status === "resolved") {
        return cloneWait(existingWait);
      }

      return this.getOrCreateWaitHandle(existingWait.id).promise;
    }

    const handle = this.getOrCreateWaitHandle(normalizedWait.id);

    await this.recordEvent({
      eventId: this.createEventId(),
      type: "wait_registered",
      occurredAt: this.now(),
      runId: run.id,
      wait: normalizedWait,
    });

    await this.reconcileWait(normalizedWait.id);
    const currentWait = this.snapshot.waits[normalizedWait.id];

    if (!currentWait) {
      throw new Error(`Wait ${normalizedWait.id} was not persisted`);
    }

    if (currentWait.status === "resolved") {
      this.waitHandles.delete(currentWait.id);
      return cloneWait(currentWait);
    }

    return handle.promise;
  }

  async closeAgent(input: CloseAgentInput): Promise<OrchestrationAgent> {
    const agent = this.requireAgent(input.agentId);
    const run = this.getActiveRun(agent.runId);

    if (agent.status === "closed") {
      return cloneAgent(agent);
    }
    if (agent.status === "closing") {
      return cloneAgent(agent);
    }

    this.closeRequestedAgents.add(input.agentId);
    const instance = this.activeAgents.get(input.agentId);
    const closeRequestedAt = this.now();
    await OrchestrationStore.appendMailboxEvent(this.sessionDir, input.agentId, {
      eventId: this.createEventId(),
      type: "agent_close_requested",
      agentId: input.agentId,
      occurredAt: closeRequestedAt,
      reason: input.reason,
    });
    const mailboxState = await OrchestrationStore.loadMailboxState(
      this.sessionDir,
      input.agentId,
    );
    await OrchestrationStore.writeMailboxState(this.sessionDir, input.agentId, {
      processedEventCount: mailboxState.processedEventCount,
      closeRequested: {
        occurredAt: closeRequestedAt,
        reason: input.reason,
      },
    });
    await this.setAgentStatus(input.agentId, "closing");

    if (!instance) {
      await this.finalizeAgentClose(run.id, input);
      return cloneAgent(this.requireAgent(input.agentId));
    }

    const existingClose = this.closeChains.get(input.agentId);
    if (!existingClose) {
      const closePromise = instance
        .close(input.reason)
        .then(async () => {
          await this.finalizeAgentClose(run.id, input);
        })
        .finally(() => {
          this.closeChains.delete(input.agentId);
        });
      this.closeChains.set(input.agentId, closePromise);
    }

    return {
      ...cloneAgent(this.requireAgent(input.agentId)),
      status: "closing",
    };
  }

  async checkTimeouts(): Promise<void> {
    const hasRunningRun = Object.values(this.snapshot.runs).some(
      (r) => r.status === "running",
    );
    if (!hasRunningRun) {
      return;
    }

    const pendingWaitIds = Object.values(this.snapshot.waits)
      .filter((wait) => wait.status === "pending" && wait.timeoutAt)
      .map((wait) => wait.id);

    for (const waitId of pendingWaitIds) {
      await this.reconcileWait(waitId);
    }
  }

  async completeRun(input: {
    runId: string;
    status: Extract<RunStatus, "completed" | "failed">;
    error?: string;
  }): Promise<void> {
    const run = this.snapshot.runs[input.runId];

    if (!run) {
      throw new Error(`No orchestration run with ID ${input.runId} has been started`);
    }

    if (run.status !== "running") {
      if (run.status === input.status && run.completedAt) {
        return;
      }

      throw new Error(`Orchestration run ${run.id} is already ${run.status}`);
    }

    await this.recordEvent({
      eventId: this.createEventId(),
      type: "run_completed",
      occurredAt: this.now(),
      runId: run.id,
      status: input.status,
      error: input.error,
    });
  }

  private async initialize(): Promise<void> {
    const recovered = await OrchestrationStore.recoverState(this.sessionDir);
    this.snapshot = recovered.snapshot;
    await this.reconcileRecoveredCloseRequests();
    await this.reconcileQueuedInputsFromMailbox();

    for (const agent of Object.values(this.snapshot.agents).filter(
      (currentAgent) => currentAgent.status !== "closed",
    )) {
      try {
        await this.attachAgent(agent);
      } catch {
        // Keep recovered state intact; a later explicit attach path can retry.
      }
    }

    await this.discardQueuedInputsForClosedAgents();
    this.resumeQueuedInputs();
    await this.reconcilePendingWaits();
    await this.checkTimeouts();
  }

  private async reconcileQueuedInputsFromMailbox(): Promise<void> {
    const hasRunningRun = Object.values(this.snapshot.runs).some(
      (r) => r.status === "running",
    );
    if (!hasRunningRun) {
      return;
    }

    const queueById = new Map(
      this.snapshot.queuedInputs.map((input) => [input.id, input] as const),
    );
    let didChange = false;

    for (const agent of Object.values(this.snapshot.agents)) {
      if (agent.status === "closed") {
        continue;
      }

      didChange =
        (await this.reconcileQueuedInputsFromMailboxForAgent(agent, queueById)) ||
        didChange;
    }

    if (!didChange) {
      return;
    }

    this.snapshot.queuedInputs = [...queueById.values()].sort((left, right) =>
      left.queuedAt.localeCompare(right.queuedAt),
    );
    await this.persistSnapshot();
  }

  private async reconcileRecoveredCloseRequests(): Promise<void> {
    const hasRunningRun = Object.values(this.snapshot.runs).some(
      (r) => r.status === "running",
    );
    if (!hasRunningRun) {
      return;
    }

    for (const agent of Object.values(this.snapshot.agents)) {
      if (agent.status === "closed") {
        continue;
      }

      const mailboxState = await OrchestrationStore.loadMailboxState(
        this.sessionDir,
        agent.id,
      );

      if (!mailboxState.closeRequested) {
        continue;
      }

      await this.recordEvent({
        eventId: this.createEventId(),
        type: "agent_closed",
        occurredAt: mailboxState.closeRequested.occurredAt,
        runId: agent.runId,
        close: {
          id: `recover-close:${agent.id}`,
          agentId: agent.id,
          reason: mailboxState.closeRequested.reason,
        },
      });

      await this.discardQueuedInputsForAgent(agent.id);
      await this.reconcileWaitsForAgent(agent.id);
    }
  }

  private async attachAgent(agent: OrchestrationAgent): Promise<void> {
    const instance = await this.runtime.createAgent({
      agentId: agent.id,
      runId: agent.runId,
      role: agent.role,
      taskId: agent.taskId,
    });
    instance.subscribe?.({
      onJobStarted: (job) => {
        this.enqueueManagedEvent(agent.id, async () => {
          await this.handleManagedJobStarted(agent.id, job);
        });
      },
      onJobCompleted: (result) => {
        this.enqueueManagedEvent(agent.id, async () => {
          await this.handleManagedJobCompleted(agent.id, result);
        });
      },
      onIdle: () => {
        this.enqueueManagedEvent(agent.id, async () => {
          await this.handleManagedIdle(agent.id);
        });
      },
    });
    this.activeAgents.set(agent.id, instance);
  }

  private async setAgentStatus(
    agentId: string,
    status: OrchestrationAgent["status"],
  ): Promise<void> {
    const agent = this.requireAgent(agentId);

    if (agent.status === status) {
      return;
    }

    await this.recordEvent({
      eventId: this.createEventId(),
      type: "agent_status_changed",
      occurredAt: this.now(),
      runId: agent.runId,
      agentId,
      status,
    });
  }

  private async finalizeAgentClose(
    runId: string,
    input: CloseAgentInput,
  ): Promise<void> {
    const currentAgent = this.snapshot.agents[input.agentId];
    if (!currentAgent || currentAgent.status === "closed") {
      return;
    }

    await this.recordEvent({
      eventId: this.createEventId(),
      type: "agent_closed",
      occurredAt: this.now(),
      runId,
      close: input,
    });

    this.activeAgents.delete(input.agentId);
    this.deliveryChains.delete(input.agentId);
    this.eventChains.delete(input.agentId);
    this.closeRequestedAgents.delete(input.agentId);

    await this.discardQueuedInputsForAgent(input.agentId);
    await this.reconcileWaitsForAgent(input.agentId);
  }

  private resumeQueuedInputs(): void {
    for (const agentId of this.activeAgents.keys()) {
      this.resumeQueuedInputsForAgent(agentId);
    }
  }

  private resumeQueuedInputsForAgent(agentId: string): void {
    const instance = this.activeAgents.get(agentId);
    if (!instance) {
      return;
    }

    if (instance.autonomousDelivery) {
      const nextQueuedInput = this.getNextQueuedInputForAgent(agentId);
      if (nextQueuedInput) {
        void instance.deliverInput(nextQueuedInput);
      }
      return;
    }

    for (const envelope of this.snapshot.queuedInputs) {
      if (envelope.agentId !== agentId) {
        continue;
      }

      void this.scheduleQueuedDelivery(agentId);
      return;
    }
  }

  private async discardQueuedInputsForClosedAgents(): Promise<void> {
    const hasRunningRun = Object.values(this.snapshot.runs).some(
      (r) => r.status === "running",
    );
    if (!hasRunningRun) {
      return;
    }

    const closedAgentIds = new Set(
      Object.values(this.snapshot.agents)
        .filter((agent) => agent.status === "closed")
        .map((agent) => agent.id),
    );

    for (const envelope of [...this.snapshot.queuedInputs]) {
      if (!closedAgentIds.has(envelope.agentId)) {
        continue;
      }

      await this.recordInputRemoval({
        inputId: envelope.id,
        agentId: envelope.agentId,
        reason: "agent_closed",
      });
    }
  }

  private async reconcileWaitsForAgent(agentId: string): Promise<void> {
    const pendingWaitIds = Object.values(this.snapshot.waits)
      .filter(
        (wait) =>
          wait.status === "pending" && getWaitTargetAgentIds(wait).includes(agentId),
      )
      .map((wait) => wait.id);

    for (const waitId of pendingWaitIds) {
      await this.reconcileWait(waitId);
    }
  }

  private async reconcilePendingWaits(): Promise<void> {
    const pendingWaitIds = Object.values(this.snapshot.waits)
      .filter((wait) => wait.status === "pending")
      .map((wait) => wait.id);

    for (const waitId of pendingWaitIds) {
      await this.reconcileWait(waitId);
    }
  }

  private async reconcileWait(waitId: string): Promise<void> {
    const wait = this.snapshot.waits[waitId];

    if (!wait || wait.status === "resolved") {
      return;
    }

    if (this.isWaitTimedOut(wait)) {
      await this.resolveWait(wait, "timed_out", {
        timeoutAt: wait.timeoutAt,
      });
      return;
    }

    if (this.isWaitSatisfied(wait)) {
      await this.resolveWait(
        wait,
        wait.kind === "agent-idle" ? "agent_idle" : "agent_closed",
      );
    }
  }

  private isWaitTimedOut(wait: WaitCondition): boolean {
    return Boolean(wait.timeoutAt && wait.timeoutAt <= this.now());
  }

  private isWaitSatisfied(wait: WaitCondition): boolean {
    const satisfiedAgentIds = this.getSatisfiedAgentIds(wait);
    const targetAgentIds = getWaitTargetAgentIds(wait);
    const match = wait.match ?? "all";

    if (match === "any") {
      return satisfiedAgentIds.length > 0;
    }

    return satisfiedAgentIds.length === targetAgentIds.length;
  }

  private getSatisfiedAgentIds(wait: WaitCondition): string[] {
    const targetAgentIds = getWaitTargetAgentIds(wait);
    const kind = wait.kind ?? "agent-closed";

    return targetAgentIds.filter((agentId) => {
      const agent = this.snapshot.agents[agentId];
      if (!agent) return false;

      switch (kind) {
        case "agent-idle":
          return (
            (agent.status === "idle" || agent.status === "closed") &&
            Boolean(agent.lastJob)
          );
        case "agent-closed":
        default:
          return agent.status === "closed";
      }
    });
  }

  private async resolveWait(
    wait: WaitCondition,
    status: "agent_closed" | "agent_idle" | "timed_out",
    extraResolution?: Record<string, unknown>,
  ): Promise<void> {
    const primaryAgent = this.snapshot.agents[wait.agentId];

    await this.recordEvent({
      eventId: this.createEventId(),
      type: "wait_resolved",
      occurredAt: this.now(),
      runId: wait.runId,
      waitId: wait.id,
      resolution: {
        status,
        match: wait.match ?? "all",
        resolvedAgentIds: this.getSatisfiedAgentIds(wait),
        pendingAgentIds: getWaitTargetAgentIds(wait).filter(
          (agentId) => !this.getSatisfiedAgentIds(wait).includes(agentId),
        ),
        ...(status === "agent_idle" && primaryAgent?.lastJob
          ? {
              job: {
                jobId: primaryAgent.lastJob.jobId,
                outcome: primaryAgent.lastJob.outcome,
                outputText: primaryAgent.lastJob.outputText,
                error: primaryAgent.lastJob.error,
              },
            }
          : {}),
        ...extraResolution,
      },
    });

    const resolvedWait = this.snapshot.waits[wait.id];

    if (!resolvedWait) {
      throw new Error(`Resolved wait ${wait.id} is missing from the snapshot`);
    }

    const handle = this.waitHandles.get(wait.id);

    if (handle) {
      handle.resolve(cloneWait(resolvedWait));
      this.waitHandles.delete(wait.id);
    }
  }

  private getActiveRun(runId: string): OrchestrationRun {
    const run = this.snapshot.runs[runId];

    if (!run) {
      throw new Error(`No orchestration run with ID ${runId} has been started`);
    }

    if (run.status !== "running") {
      throw new Error(`Orchestration run ${runId} is not running`);
    }

    return run;
  }

  private requireAgent(agentId: string): OrchestrationAgent {
    const agent = this.snapshot.agents[agentId];

    if (!agent) {
      throw new Error(`Unknown orchestration agent ${agentId}`);
    }

    return agent;
  }

  private requireTask(taskId: string): void {
    if (!this.snapshot.tasks[taskId]) {
      const knownTaskIds = Object.keys(this.snapshot.tasks);
      const knownTasks = knownTaskIds.length > 0
        ? ` Known task IDs: ${knownTaskIds.join(", ")}.`
        : "";
      throw new Error(`Unknown orchestration task ${taskId}.${knownTasks}`);
    }
  }

  private getOrCreateWaitHandle(waitId: string): WaitHandle {
    const existingHandle = this.waitHandles.get(waitId);

    if (existingHandle) {
      return existingHandle;
    }

    let resolve!: (wait: WaitCondition) => void;
    const promise = new Promise<WaitCondition>((resolvePromise) => {
      resolve = resolvePromise;
    });
    const handle = {
      promise,
      resolve,
    };

    this.waitHandles.set(waitId, handle);
    return handle;
  }

  private async recordEvent(event: OrchestrationEvent): Promise<void> {
    await OrchestrationStore.appendEvent(this.sessionDir, event);
    applyOrchestrationEvent(this.snapshot, event);
    await this.persistSnapshot();

    const snapshot = cloneOrchestrationSnapshot(this.snapshot);

    for (const listener of this.listeners) {
      listener({
        event,
        snapshot,
      });
    }
  }

  private createEventId(): string {
    return randomUUID();
  }

  /**
   * Generate a short, human-readable codename once at spawn time so every
   * sub-agent gets a stable label that survives event replay and page refreshes.
   */
  private generateAgentDisplayName(
    runId: string,
    agentId: string,
    role: string,
  ): string {
    const existingNames = new Set(
      Object.values(this.snapshot.agents)
        .map((agent) => agent.displayName?.toLowerCase())
        .filter((name): name is string => Boolean(name)),
    );

    for (let attempt = 0; attempt < DISPLAY_NAME_WORDS.length; attempt += 1) {
      const candidate = createDisplayName(runId, agentId, role, attempt);
      if (!existingNames.has(candidate.toLowerCase())) {
        return candidate;
      }
    }

    return `${createDisplayName(runId, agentId, role, 0)}-${agentId.slice(-4)}`;
  }

  private enqueueManagedEvent(
    agentId: string,
    task: () => Promise<void>,
  ): void {
    const previous = this.eventChains.get(agentId) ?? Promise.resolve();
    const next = previous
      .then(task)
      .catch(() => undefined)
      .finally(() => {
        if (this.eventChains.get(agentId) === next) {
          this.eventChains.delete(agentId);
        }
      });
    this.eventChains.set(agentId, next);
  }

  private scheduleQueuedDelivery(agentId: string): Promise<void> {
    if (!this.activeAgents.has(agentId)) {
      throw new Error(
        `Agent ${agentId} does not have an active runtime`,
      );
    }

    if (this.deliveryChains.has(agentId)) {
      return Promise.resolve();
    }

    const nextDelivery = this.runQueuedDeliveryLoop(agentId).finally(() => {
      this.deliveryChains.delete(agentId);
    });

    this.deliveryChains.set(agentId, nextDelivery.catch(() => undefined));

    return Promise.resolve();
  }

  private async runQueuedDeliveryLoop(agentId: string): Promise<void> {
    while (true) {
      const currentAgent = this.snapshot.agents[agentId];
      if (
        !currentAgent ||
        currentAgent.status === "closed" ||
        currentAgent.status === "closing" ||
        this.closeRequestedAgents.has(agentId)
      ) {
        return;
      }

      await this.reconcileQueuedInputsFromMailboxForAgent(currentAgent);

      const envelope = this.getNextQueuedInputForAgent(agentId);
      if (!envelope) {
        return;
      }

      const instance = this.activeAgents.get(agentId);
      if (!instance) {
        throw new Error(`Agent ${agentId} does not have an active runtime`);
      }

      this.inFlightInputIds.add(envelope.id);
      const drainedInputs = await this.getPendingInputsForAgent(agentId);
      const jobInputs = drainedInputs.length > 0 ? drainedInputs : [envelope];
      const latestBeforeStart = this.snapshot.agents[agentId];
      if (
        !latestBeforeStart ||
        latestBeforeStart.status === "closing" ||
        latestBeforeStart.status === "closed" ||
        this.closeRequestedAgents.has(agentId)
      ) {
        this.inFlightInputIds.delete(envelope.id);
        return;
      }
      await this.setAgentStatus(agentId, "running");
      const startedAt = this.now();
      const defaultJobId = `job:${envelope.id}:${startedAt}`;
      const agentRunId = this.requireAgent(agentId).runId;
      await this.recordEvent({
        eventId: this.createEventId(),
        type: "agent_job_started",
        occurredAt: startedAt,
        runId: agentRunId,
        agentId,
        jobId: defaultJobId,
        inputIds: jobInputs.map((input) => input.id),
      });

      let deliveryResult: ManagedAgentDeliveryResult;
      try {
        deliveryResult = normalizeDeliveryResult(
          envelope,
          await instance.deliverInput(envelope),
          startedAt,
        );
      } catch (error) {
        deliveryResult = {
          jobId: defaultJobId,
          consumedInputIds: [envelope.id],
          outcome: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        this.inFlightInputIds.delete(envelope.id);
      }

      const completionEvent = {
        eventId: this.createEventId(),
        occurredAt: this.now(),
        runId: agentRunId,
        agentId,
        job: {
          jobId: deliveryResult.jobId,
          inputIds: deliveryResult.consumedInputIds,
          outcome: deliveryResult.outcome,
          outputText: deliveryResult.outputText,
          error: deliveryResult.error,
        },
      } as const;

      await this.recordEvent(
        deliveryResult.outcome === "failed"
          ? {
              ...completionEvent,
              type: "agent_job_failed",
            }
          : {
              ...completionEvent,
              type: "agent_job_completed",
            },
      );

      for (const inputId of deliveryResult.consumedInputIds) {
        await this.recordInputRemoval({
          inputId,
          agentId,
          reason: "delivered",
        });
      }
      await this.advanceMailboxStateForDeliveredInputs(
        agentId,
        deliveryResult.consumedInputIds,
      );

      const latestAgent = this.snapshot.agents[agentId];
      if (latestAgent && latestAgent.status === "running") {
        await this.setAgentStatus(agentId, "idle");
      }

      await this.reconcileWaitsForAgent(agentId);
    }
  }

  private hasQueuedInput(inputId: string): boolean {
    return this.snapshot.queuedInputs.some((input) => input.id === inputId);
  }

  private getNextQueuedInputForAgent(agentId: string): AgentInputEnvelope | undefined {
    return this.snapshot.queuedInputs
      .filter((input) => input.agentId === agentId)
      .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt))[0];
  }

  private async recordInputRemoval(input: RemoveInputInput): Promise<void> {
    if (!this.hasQueuedInput(input.inputId)) {
      return;
    }

    const agent = this.requireAgent(input.agentId);
    await this.recordEvent({
      eventId: this.createEventId(),
      type: "agent_input_removed",
      occurredAt: this.now(),
      runId: agent.runId,
      inputId: input.inputId,
      agentId: input.agentId,
      reason: input.reason,
    });
  }

  private async discardQueuedInputsForAgent(agentId: string): Promise<void> {
    const queuedInputs = this.snapshot.queuedInputs.filter(
      (input) =>
        input.agentId === agentId && !this.inFlightInputIds.has(input.id),
    );

    for (const queuedInput of queuedInputs) {
      await this.recordInputRemoval({
        inputId: queuedInput.id,
        agentId,
        reason: "agent_closed",
      });
    }
  }

  private async persistSnapshot(): Promise<void> {
    await OrchestrationStore.writeCheckpoint(this.sessionDir, this.snapshot);
  }

  private async getPendingInputsForAgent(
    agentId: string,
  ): Promise<AgentInputEnvelope[]> {
    const [mailboxEvents, mailboxState] = await Promise.all([
      OrchestrationStore.loadMailboxEvents(this.sessionDir, agentId),
      OrchestrationStore.loadMailboxState(this.sessionDir, agentId),
    ]);
    const pendingMailboxInputs = mailboxEvents
      .slice(mailboxState.processedEventCount)
      .filter(
        (
          event,
        ): event is Extract<typeof event, { type: "input_enqueued" }> =>
          event.type === "input_enqueued",
      )
      .map((event) => ({
        id: event.inputId,
        agentId: event.agentId,
        payload: event.payload,
        queuedAt: event.occurredAt,
      }));

    if (pendingMailboxInputs.length > 0) {
      return pendingMailboxInputs;
    }

    return this.snapshot.queuedInputs
      .filter((input) => input.agentId === agentId)
      .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
  }

  private async advanceMailboxStateForDeliveredInputs(
    agentId: string,
    consumedInputIds: string[],
  ): Promise<void> {
    if (consumedInputIds.length === 0) {
      return;
    }

    const [mailboxEvents, mailboxState] = await Promise.all([
      OrchestrationStore.loadMailboxEvents(this.sessionDir, agentId),
      OrchestrationStore.loadMailboxState(this.sessionDir, agentId),
    ]);
    const remainingInputIds = [...consumedInputIds];
    let nextProcessedEventCount = mailboxState.processedEventCount;

    while (nextProcessedEventCount < mailboxEvents.length) {
      const event = mailboxEvents[nextProcessedEventCount];

      if (event?.type === "input_enqueued") {
        if (remainingInputIds[0] !== event.inputId) {
          break;
        }
        remainingInputIds.shift();
      }

      nextProcessedEventCount += 1;

      if (remainingInputIds.length === 0) {
        while (nextProcessedEventCount < mailboxEvents.length) {
          const nextEvent = mailboxEvents[nextProcessedEventCount];
          if (nextEvent?.type === "input_enqueued") {
            break;
          }
          nextProcessedEventCount += 1;
        }
        break;
      }
    }

    if (nextProcessedEventCount <= mailboxState.processedEventCount) {
      return;
    }

    await OrchestrationStore.writeMailboxState(this.sessionDir, agentId, {
      processedEventCount: nextProcessedEventCount,
      closeRequested: mailboxState.closeRequested,
    });
  }

  private async handleManagedJobStarted(
    agentId: string,
    job: { jobId: string; inputIds: string[] },
  ): Promise<void> {
    const agent = this.snapshot.agents[agentId];
    if (!agent || agent.status === "closed") {
      return;
    }

    if (agent.status !== "running") {
      await this.setAgentStatus(agentId, "running");
    }

    await this.recordEvent({
      eventId: this.createEventId(),
      type: "agent_job_started",
      occurredAt: this.now(),
      runId: agent.runId,
      agentId,
      jobId: job.jobId,
      inputIds: job.inputIds,
    });
  }

  private async handleManagedJobCompleted(
    agentId: string,
    result: ManagedAgentDeliveryResult,
  ): Promise<void> {
    const agent = this.snapshot.agents[agentId];
    if (!agent || agent.status === "closed") {
      return;
    }

    await this.recordEvent({
      eventId: this.createEventId(),
      occurredAt: this.now(),
      runId: agent.runId,
      agentId,
      type: result.outcome === "failed" ? "agent_job_failed" : "agent_job_completed",
      job: {
        jobId: result.jobId,
        inputIds: result.consumedInputIds,
        outcome: result.outcome,
        outputText: result.outputText,
        error: result.error,
      },
    });

    for (const inputId of result.consumedInputIds) {
      await this.recordInputRemoval({
        inputId,
        agentId,
        reason: "delivered",
      });
    }

    await this.advanceMailboxStateForDeliveredInputs(
      agentId,
      result.consumedInputIds,
    );
    await this.reconcileQueuedInputsFromMailboxForAgent(this.requireAgent(agentId));
    await this.reconcileWaitsForAgent(agentId);
  }

  private async handleManagedIdle(agentId: string): Promise<void> {
    const agent = this.snapshot.agents[agentId];
    if (!agent || agent.status === "closed" || agent.status === "closing") {
      return;
    }

    if (agent.status === "running") {
      await this.setAgentStatus(agentId, "idle");
    }

    await this.reconcileWaitsForAgent(agentId);
  }

  private async reconcileQueuedInputsFromMailboxForAgent(
    agent: OrchestrationAgent,
    queueById = new Map(
      this.snapshot.queuedInputs.map((input) => [input.id, input] as const),
    ),
  ): Promise<boolean> {
    const [mailboxEvents, mailboxState] = await Promise.all([
      OrchestrationStore.loadMailboxEvents(this.sessionDir, agent.id),
      OrchestrationStore.loadMailboxState(this.sessionDir, agent.id),
    ]);
    const pendingInputs = mailboxEvents
      .slice(mailboxState.processedEventCount)
      .filter(
        (
          event,
        ): event is Extract<typeof event, { type: "input_enqueued" }> =>
          event.type === "input_enqueued",
      )
      .map((event) => ({
        id: event.inputId,
        agentId: event.agentId,
        payload: event.payload,
        queuedAt: event.occurredAt,
      }));
    const pendingInputIds = new Set(pendingInputs.map((input) => input.id));
    const hasAuthoritativeMailboxState =
      mailboxEvents.length > 0 ||
      mailboxState.processedEventCount > 0 ||
      mailboxState.closeRequested !== null;
    let didChange = false;

    if (hasAuthoritativeMailboxState) {
      for (const queuedInput of this.snapshot.queuedInputs) {
        if (
          queuedInput.agentId === agent.id &&
          !pendingInputIds.has(queuedInput.id)
        ) {
          queueById.delete(queuedInput.id);
          didChange = true;
        }
      }
    }

    for (const pendingInput of pendingInputs) {
      if (queueById.has(pendingInput.id)) {
        continue;
      }

      queueById.set(pendingInput.id, pendingInput);
      didChange = true;
    }

    if (didChange) {
      this.snapshot.queuedInputs = [...queueById.values()].sort((left, right) =>
        left.queuedAt.localeCompare(right.queuedAt),
      );
    }

    return didChange;
  }
}
