/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import path from "node:path";
import {
  OrchestrationManager,
  type CreateManagedAgentInput,
  type ManagedAgentInstance,
  type StartRunInput,
} from "@agentrail/orchestration";

export type CreateSessionManagedAgent = (
  input: CreateManagedAgentInput,
) => Promise<ManagedAgentInstance>;

export interface AgentrailOrchestrationRegistryRequest {
  tenantId: string;
  userId: string;
  sessionId: string;
  createManagedAgent: CreateSessionManagedAgent;
}

export interface AgentrailOrchestrationRegistry {
  getManager(
    request: AgentrailOrchestrationRegistryRequest,
  ): Promise<OrchestrationManager>;
  invalidate(tenantId: string, sessionId: string): void;
}

export interface CreateOrchestrationRegistryOptions {
  dataDir: string;
  createStartRunInput?: (
    request: Pick<
      AgentrailOrchestrationRegistryRequest,
      "tenantId" | "userId" | "sessionId"
    >,
  ) => StartRunInput;
}

class SessionOrchestrationRegistry implements AgentrailOrchestrationRegistry {
  private readonly managers = new Map<string, Promise<OrchestrationManager>>();
  private readonly bindings = new Map<string, CreateSessionManagedAgent>();

  constructor(private readonly options: CreateOrchestrationRegistryOptions) {}

  async getManager(
    request: AgentrailOrchestrationRegistryRequest,
  ): Promise<OrchestrationManager> {
    const key = this.getKey(request.tenantId, request.sessionId);
    if (!this.bindings.has(key)) {
      this.bindings.set(key, request.createManagedAgent);
    }

    let managerPromise = this.managers.get(key);
    if (!managerPromise) {
      managerPromise = this.createManager(key, request.tenantId, request.sessionId);
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

  private getSessionDir(tenantId: string, sessionId: string): string {
    return path.join(
      this.options.dataDir,
      "tenants",
      tenantId,
      "sessions",
      sessionId,
    );
  }

  private async createManager(
    key: string,
    tenantId: string,
    sessionId: string,
  ): Promise<OrchestrationManager> {
    try {
      return await OrchestrationManager.create({
        sessionDir: this.getSessionDir(tenantId, sessionId),
        runtime: {
          createAgent: async (input) => {
            const createManagedAgent = this.bindings.get(key);
            if (!createManagedAgent) {
              throw new Error(`Missing orchestration binding for session ${sessionId}`);
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
    request: Pick<
      AgentrailOrchestrationRegistryRequest,
      "tenantId" | "userId" | "sessionId"
    >,
  ): Promise<void> {
    if (manager.getSnapshot().run) {
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

export function createOrchestrationRegistry(
  options: CreateOrchestrationRegistryOptions,
): AgentrailOrchestrationRegistry {
  return new SessionOrchestrationRegistry(options);
}
