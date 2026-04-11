/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { executeSlashCommand, parseRegisteredSlashCommand } from "@/commands/registry.js";
import type { AgentrailPlugin } from "@agentrail/app";

export function createSlashCommandsPlugin(): AgentrailPlugin {
  return {
    name: "playground-slash-commands",
    interceptChatRequest: async ({ request }) => {
      if (!parseRegisteredSlashCommand(request.message)) {
        return null;
      }

      const result = await executeSlashCommand(request.message, {
        tenantId: request.tenantId,
        userId: request.userId,
        sessionId: request.sessionId,
      });

      return {
        status: result.status === "error" ? 400 : 200,
        body: {
          sessionId: request.sessionId ?? null,
          text: result.message,
          usage: { inputTokens: 0, outputTokens: 0 },
          stopReason: "stop",
          commandResult: result,
        },
      };
    },
  };
}
