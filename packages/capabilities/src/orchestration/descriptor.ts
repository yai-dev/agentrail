/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SessionRef } from "@agentrail/core";
import type { CapabilityBuildContext, CapabilityDescriptor } from "@/types.js";
import type { CreateManagedAgentInput, ManagedAgentInstance, OrchestrationManager } from "@/orchestration/orchestration-manager.js";
import {
  createCloseAgentTool,
  createSendInputTool,
  createSpawnAgentTool,
  createWaitAgentTool,
} from "@/orchestration/tools/index.js";

/**
 * Minimal registry interface for resolving session-scoped orchestration managers.
 *
 * Compatible with `AgentrailOrchestrationRegistry` from `@agentrail/app` but
 * intentionally defined here to avoid a circular package dependency.
 */
export interface OrchestrationRegistryLike {
  getManager(request: {
    tenantId: string;
    userId: string;
    sessionId: string;
    sessionRef: SessionRef;
    createManagedAgent: (input: CreateManagedAgentInput) => Promise<ManagedAgentInstance>;
  }): Promise<OrchestrationManager>;
}

/**
 * Per-spawn factory called by the orchestration descriptor when the agent needs to
 * create a new managed sub-agent. Receives both the spawn input and the current
 * session context so it can resolve the right worker/process.
 */
export type CreateManagedAgentFn = (
  input: CreateManagedAgentInput,
  ctx: { tenantId: string; userId: string; sessionId: string; sessionRef: SessionRef },
) => Promise<ManagedAgentInstance>;

/**
 * Escape-hatch options: supply a fully pre-constructed `OrchestrationManager`.
 * Use this only when you manage the manager lifecycle externally.
 */
export interface OrchestrationOptions {
  manager: OrchestrationManager;
}

/**
 * Capability that enables the agent to spawn and coordinate managed sub-agents.
 *
 * **Recommended usage** — declare with a registry and agent factory at the profile level:
 *
 * ```ts
 * const profile = defineProfile({
 *   capabilities: [
 *     orchestration(orchestrationRegistry, (input, ctx) =>
 *       createSubAgentProcess({ ...ctx, input, workerPath: "./worker.js" })),
 *   ],
 * });
 * ```
 *
 * **Escape hatch** — pass `{ manager }` to supply a pre-constructed manager
 * (e.g. in custom hosts that manage the registry externally):
 *
 * ```ts
 * orchestration({ manager: myManager })
 * ```
 *
 * @see {@link https://agentrail.run/capabilities/orchestration}
 */
export function orchestration(
  registry: OrchestrationRegistryLike,
  createManagedAgent: CreateManagedAgentFn,
): CapabilityDescriptor;
export function orchestration(opts: OrchestrationOptions): CapabilityDescriptor;
export function orchestration(
  registryOrOpts: OrchestrationRegistryLike | OrchestrationOptions,
  createManagedAgent?: CreateManagedAgentFn,
): CapabilityDescriptor {
  return {
    type: "orchestration",

    async buildTools(ctx: CapabilityBuildContext) {
      let om: OrchestrationManager;

      if ("manager" in registryOrOpts) {
        om = registryOrOpts.manager;
      } else {
        if (!createManagedAgent) {
          throw new Error(
            "orchestration() requires a createManagedAgent factory when using the registry form.",
          );
        }
        const registry = registryOrOpts as OrchestrationRegistryLike;
        om = await registry.getManager({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          sessionRef: ctx.sessionRef,
          createManagedAgent: (input) =>
            createManagedAgent(input, {
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              sessionId: ctx.sessionId,
              sessionRef: ctx.sessionRef,
            }),
        });
      }

      const activeRun = Object.values(om.getSnapshot().runs).find((r) => r.status === "running");
      if (!activeRun) {
        throw new Error(
          `orchestration() capability built tools but no active run exists in the manager. ` +
            `Ensure manager.startRun() has been called before building tools.`,
        );
      }
      return [
        createSpawnAgentTool(om, activeRun.id),
        createSendInputTool(om),
        createWaitAgentTool(om),
        createCloseAgentTool(om),
      ];
    },
  };
}
