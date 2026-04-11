/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { OrchestrationManager } from "@/orchestration/orchestration-manager.js";
import { Type, tool } from "@agentrail/core";

function formatSendInputResult(inputId: string, agentId: string): string {
  return JSON.stringify({
    inputId,
    agentId,
    queued: true,
    jobId: null,
  });
}

/** Creates the runtime tool that queues input for a managed sub-agent. */
export function createSendInputTool(manager: OrchestrationManager) {
  return tool()
    .name("send_input")
    .label("send_input")
    .description("Queue structured input for an orchestration sub-agent.")
    .parameters(
      Type.Object({
        id: Type.String({ description: "Unique queued input ID." }),
        agentId: Type.String({ description: "Target orchestration agent ID." }),
        payload: Type.Record(Type.String(), Type.Unknown(), {
          description: "Structured payload delivered to the target agent.",
        }),
      }),
    )
    .execute(async (input) => {
      await manager.sendInput(input);
      return {
        content: [
          {
            type: "text" as const,
            text: formatSendInputResult(input.id, input.agentId),
          },
        ],
        details: {
          inputId: input.id,
          agentId: input.agentId,
          queued: true,
          jobId: null,
        },
      };
    })
    .build();
}
