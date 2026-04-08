/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { Type, tool } from "@agentrail/core";
import type { OrchestrationManager } from "@/orchestration/orchestration-manager.js";
import type { WaitCondition } from "@/orchestration/types.js";

function formatWaitResult(wait: WaitCondition): string {
  return JSON.stringify({
    waitId: wait.id,
    agentId: wait.agentId,
    status: wait.status,
    kind: wait.kind,
    match: wait.match ?? "all",
  });
}

/** Creates the runtime tool that registers a wait condition for managed agents. */
export function createWaitAgentTool(manager: OrchestrationManager) {
  return tool()
    .name("wait_agent")
    .label("wait_agent")
    .description("Wait for one or more orchestration agents to satisfy a condition.")
    .parameters(
      Type.Object({
        id: Type.String({ description: "Unique wait condition ID." }),
        agentId: Type.String({ description: "Primary orchestration agent ID." }),
        agentIds: Type.Optional(
          Type.Array(Type.String(), {
            description: "Optional set of agent IDs to wait on.",
          }),
        ),
        kind: Type.String({
          description:
            "Condition kind. 'agent-closed' waits for explicit close; 'agent-idle' waits for task completion (idle or closed).",
        }),
        description: Type.String({ description: "Human-readable wait description." }),
        match: Type.Optional(
          Type.Union([Type.Literal("any"), Type.Literal("all")], {
            description: "Whether any or all agents must satisfy the condition.",
          }),
        ),
        timeoutAt: Type.Optional(
          Type.String({
            description: "Optional ISO-8601 timeout timestamp for the wait.",
          }),
        ),
      }),
    )
    .execute(async (input) => {
      const wait = await manager.waitForAgents(input);
      return {
        content: [{ type: "text" as const, text: formatWaitResult(wait) }],
        details: {
          waitId: wait.id,
          agentId: wait.agentId,
          status: wait.status,
          kind: wait.kind,
          match: wait.match ?? "all",
          resolution: wait.resolution,
        },
      };
    })
    .build();
}
