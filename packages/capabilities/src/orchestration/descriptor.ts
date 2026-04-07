/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { CapabilityBuildContext, CapabilityDescriptor } from "../types.js";
import type { OrchestrationManager } from "./orchestration-manager.js";
import {
  createCloseAgentTool,
  createSendInputTool,
  createSpawnAgentTool,
  createWaitAgentTool,
} from "./tools/index.js";

/**
 * Capability that enables the agent to spawn and coordinate managed sub-agents.
 *
 * @param manager – The OrchestrationManager that tracks active sub-agents.
 * @see {@link https://agentrail.run/capabilities/orchestration}
 */
export function orchestration(manager: OrchestrationManager): CapabilityDescriptor {
  return {
    type: "orchestration",

    async buildTools(ctx: CapabilityBuildContext) {
      const om = ctx.orchestrationManager ?? manager;
      const { sessionId } = ctx;

      return [
        createSpawnAgentTool(om, sessionId),
        createSendInputTool(om),
        createWaitAgentTool(om),
        createCloseAgentTool(om),
      ];
    },
  };
}
