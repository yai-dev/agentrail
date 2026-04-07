/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { Type, tool } from "@agentrail/core";
import type { OrchestrationManager } from "../orchestration-manager.js";
import type { OrchestrationAgent } from "../types.js";

function formatCloseResult(agent: OrchestrationAgent, reason?: string): string {
  return JSON.stringify({
    agentId: agent.id,
    status: agent.status,
    reason: reason ?? null,
  });
}

/** Creates the runtime tool that requests closure of a managed sub-agent. */
export function createCloseAgentTool(manager: OrchestrationManager) {
  return tool()
    .name("close_agent")
    .label("close_agent")
    .description("Close an orchestration sub-agent and resolve dependent waits.")
    .parameters(
      Type.Object({
        id: Type.String({ description: "Unique close request ID." }),
        agentId: Type.String({ description: "Target orchestration agent ID." }),
        reason: Type.Optional(
          Type.String({ description: "Optional reason for closing the agent." }),
        ),
      }),
    )
    .execute(async (input) => {
      const agent = await manager.closeAgent(input);
      return {
        content: [
          {
            type: "text" as const,
            text: formatCloseResult(agent, input.reason),
          },
        ],
        details: {
          agentId: agent.id,
          status: agent.status,
          reason: input.reason,
        },
      };
    })
    .build();
}
