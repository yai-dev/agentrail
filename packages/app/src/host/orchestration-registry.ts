/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SessionRef } from "@agentrail/core";
import {
  OrchestrationManager,
  createFilesystemOrchestrationPersistence,
  type CreateManagedAgentInput,
  type ManagedAgentInstance,
  type StartRunInput,
} from "@agentrail/capabilities";

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

    const manager = await managerPromise;
    await this.ensureRun(manager, request);
    return manager;
  }

  invalidate(tenantId: string, sessionId: string): void {
    const key = this.getKey(tenantId, sessionId);
    this.bindings.delete(key);
    this.managers.delete(key);
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

  private async ensureRun(
    manager: OrchestrationManager,
    request: Pick<AgentrailOrchestrationRegistryRequest, "tenantId" | "userId" | "sessionId">,
  ): Promise<void> {
    if (Object.keys(manager.getSnapshot().runs).length > 0) {
      return;
    }

    await manager.startRun(
      this.options.createStartRunInput?.(request) ?? {
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
      },
    );
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
