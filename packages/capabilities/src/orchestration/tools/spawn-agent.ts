/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { Type, tool } from "@agentrail/core";
import type { OrchestrationManager } from "@/orchestration/orchestration-manager.js";
import type { OrchestrationAgent } from "@/orchestration/types.js";

function formatSpawnResult(agent: OrchestrationAgent): string {
  return JSON.stringify({
    agentId: agent.id,
    displayName: agent.displayName,
    status: agent.status,
    role: agent.role,
    taskId: agent.taskId,
  });
}

/** Creates the runtime tool that spawns a managed sub-agent inside a run. */
export function createSpawnAgentTool(manager: OrchestrationManager, runId: string) {
  return tool()
    .name("spawn_agent")
    .label("spawn_agent")
    .description("Spawn a session-scoped orchestration sub-agent for a task.")
    .parameters(
      Type.Object({
        id: Type.String({ description: "Unique orchestration agent ID." }),
        taskId: Type.Optional(
          Type.String({
            description:
              "Optional task ID the sub-agent belongs to. Omit this to attach the sub-agent to the current root task.",
          }),
        ),
        displayName: Type.Optional(
          Type.String({
            description:
              "Optional UI codename for the sub-agent. If omitted, orchestration generates one automatically.",
          }),
        ),
        role: Type.String({ description: "Role or specialization for the sub-agent." }),
      }),
    )
    .execute(async (input) => {
      const agent = await manager.spawnAgent({ ...input, runId });
      return {
        content: [{ type: "text" as const, text: formatSpawnResult(agent) }],
        details: {
          agentId: agent.id,
          displayName: agent.displayName,
          status: agent.status,
          role: agent.role,
          taskId: agent.taskId,
        },
      };
    })
    .build();
}
