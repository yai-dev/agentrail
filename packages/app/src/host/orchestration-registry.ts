/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import {
  OrchestrationManager,
  createFilesystemOrchestrationPersistence,
  type CreateManagedAgentInput,
  type ManagedAgentInstance,
  type StartRunInput,
} from "@agentrail/capabilities";
import type { SessionRef } from "@agentrail/core";

/** Factory that creates a managed agent bound to one session. */
export type CreateSessionManagedAgent = (
  input: CreateManagedAgentInput,
) => Promise<ManagedAgentInstance>;

/** Request context used when resolving a session orchestration manager. */
export interface AgentrailOrchestrationRegistryRequest {
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionRef: SessionRef;
  /**
   * Factory that creates managed agents for this session.
   * Required the first time a manager is created for a given session.
   * May be omitted when a manager already exists (e.g. stream-route SSE subscription).
   */
  createManagedAgent?: CreateSessionManagedAgent;
}

/** Registry that returns one orchestration manager per session. */
export interface AgentrailOrchestrationRegistry {
  getManager(request: AgentrailOrchestrationRegistryRequest): Promise<OrchestrationManager>;
  /**
   * Ensures an active run exists for the given session and returns its run id.
   * If a run is already running, the existing id is returned immediately.
   * If no run exists yet, a new one is started and its id is returned.
   * Called lazily from spawn_agent so that simple conversations never write orchestration files.
   */
  ensureActiveRunId(
    request: Pick<AgentrailOrchestrationRegistryRequest, "tenantId" | "userId" | "sessionId">,
  ): Promise<string>;
  invalidate(tenantId: string, sessionId: string): void;
}

/** Inputs required to create the default orchestration registry. */
export interface CreateOrchestrationRegistryOptions {
  dataDir: string;
  createStartRunInput?: (
    request: Pick<AgentrailOrchestrationRegistryRequest, "tenantId" | "userId" | "sessionId">,
  ) => StartRunInput;
}

class SessionOrchestrationRegistry implements AgentrailOrchestrationRegistry {
  private readonly managers = new Map<string, Promise<OrchestrationManager>>();
  private readonly bindings = new Map<string, CreateSessionManagedAgent>();
  /**
   * Per-session mutex for lazy run creation.  When two spawn_agent calls race on the
   * same session before any run exists, only the first one creates the Promise and stores
   * it here; subsequent callers find it and await the same Promise, guaranteeing that
   * manager.startRun() is called exactly once regardless of concurrency.
   * The entry is removed (via .finally) once the Promise settles so future calls take
   * the fast path directly against manager.getSnapshot().
   */
  private readonly runStartLocks = new Map<string, Promise<string>>();

  constructor(private readonly options: CreateOrchestrationRegistryOptions) {}

  async getManager(request: AgentrailOrchestrationRegistryRequest): Promise<OrchestrationManager> {
    const key = this.getKey(request.tenantId, request.sessionId);

    if (request.createManagedAgent) {
      const existing = this.bindings.get(key);
      if (!existing) {
        this.bindings.set(key, request.createManagedAgent);
      } else if (existing !== request.createManagedAgent) {
        // Warn when a different factory is supplied for an already-bound session.
        // The existing factory is kept to avoid re-initialising in-flight agents.
        console.warn(
          `[OrchestrationRegistry] A different createManagedAgent factory was passed for ` +
            `session "${request.sessionId}" (tenant "${request.tenantId}"). ` +
            `The original factory will continue to be used for this session. ` +
            `Call invalidate() first if you intentionally want to replace it.`,
        );
      }
    }

    let managerPromise = this.managers.get(key);
    if (!managerPromise) {
      if (!request.createManagedAgent) {
        throw new Error(
          `[OrchestrationRegistry] Cannot create a manager for session "${request.sessionId}" ` +
            `without a createManagedAgent factory. The orchestration() capability must be ` +
            `initialized before the stream route subscribes to events.`,
        );
      }
      managerPromise = this.createManager(key, request);
      this.managers.set(key, managerPromise);
    }

    return managerPromise;
  }

  invalidate(tenantId: string, sessionId: string): void {
    const key = this.getKey(tenantId, sessionId);
    this.bindings.delete(key);
    this.managers.delete(key);
    this.runStartLocks.delete(key);
  }

  private getKey(tenantId: string, sessionId: string): string {
    return `${tenantId}:${sessionId}`;
  }

  private async createManager(
    key: string,
    request: Pick<AgentrailOrchestrationRegistryRequest, "tenantId" | "sessionId" | "sessionRef">,
  ): Promise<OrchestrationManager> {
    try {
      return await OrchestrationManager.create({
        persistence: createFilesystemOrchestrationPersistence(
          this.options.dataDir,
          request.sessionRef,
        ),
        runtime: {
          createAgent: async (input) => {
            const createManagedAgent = this.bindings.get(key);
            if (!createManagedAgent) {
              throw new Error(`Missing orchestration binding for session ${request.sessionId}`);
            }

            return createManagedAgent(input);
          },
        },
      });
    } catch (error) {
      this.managers.delete(key);
      throw error;
    }
  }

  async ensureActiveRunId(
    request: Pick<AgentrailOrchestrationRegistryRequest, "tenantId" | "userId" | "sessionId">,
  ): Promise<string> {
    const key = this.getKey(request.tenantId, request.sessionId);
    const managerPromise = this.managers.get(key);
    if (!managerPromise) {
      throw new Error(
        `[OrchestrationRegistry] Cannot ensure a run for session "${request.sessionId}" — ` +
          `no manager exists. The orchestration() capability must be initialized before calling ensureActiveRunId().`,
      );
    }
    const manager = await managerPromise;

    // Fast path — a run is already active (the common case after the first spawn).
    const existing = Object.values(manager.getSnapshot().runs).find((r) => r.status === "running");
    if (existing) return existing.id;

    // Slow path — no run yet.  Serialize concurrent first-spawn callers with a
    // per-session Promise lock so manager.startRun() is called exactly once.
    //
    // The get + set pair is synchronous (no await between them), which means
    // JavaScript's single-threaded event loop guarantees they execute atomically
    // after the await above: the first caller creates the Promise and stores it
    // before any other suspended caller can resume and observe the map.
    const existingLock = this.runStartLocks.get(key);
    if (existingLock) return existingLock;

    const startPromise = (async () => {
      // Double-check inside the lock: a concurrent caller that already held the
      // lock might have started the run between our fast-path check above and now.
      const alreadyRunning = Object.values(manager.getSnapshot().runs).find(
        (r) => r.status === "running",
      );
      if (alreadyRunning) return alreadyRunning.id;

      const input = this.options.createStartRunInput?.(request) ?? {
        runId: `orchestration:${request.sessionId}`,
        initialTask: {
          id: `task:${request.sessionId}:root`,
          kind: "agentrail-default-orchestration",
          input: {
            tenantId: request.tenantId,
            userId: request.userId,
            sessionId: request.sessionId,
          },
        },
      };
      await manager.startRun(input);
      return input.runId;
    })().finally(() => {
      this.runStartLocks.delete(key);
    });

    this.runStartLocks.set(key, startPromise);
    return startPromise;
  }
}

/**
 * Creates a registry that lazily initializes one orchestration manager per session.
 *
 * @see {@link https://agentrail.run/reference/host-primitives}
 */
export function createOrchestrationRegistry(
  options: CreateOrchestrationRegistryOptions,
): AgentrailOrchestrationRegistry {
  return new SessionOrchestrationRegistry(options);
}
