/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { Hono } from "hono";
import type { SlashCommandRegistry } from "./registry.js";

interface CommandRequest {
  command: string;
  tenantId: string;
  userId: string;
  sessionId?: string;
}

export function createCommandsRoute(registry: SlashCommandRegistry): Hono {
  const commands = new Hono();

  commands.get("/", async (c) => {
    const sessionId = c.req.query("sessionId") ?? undefined;
    const commandList = registry
      .definitions()
      .map((command) => ({
        name: `/${command.name}`,
        description: command.description,
        scope: command.scope,
        requiresSession: command.requiresSession,
        runsInBackground: command.runsInBackground,
        writesConversationHistory: command.writesConversationHistory,
        available: !command.requiresSession || !!sessionId,
        unavailableReason:
          command.requiresSession && !sessionId
            ? "需要先进入一个已有会话"
            : null,
      }));
    return c.json({ commands: commandList });
  });

  commands.post("/", async (c) => {
    let body: CommandRequest;
    try {
      body = await c.req.json<CommandRequest>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.command || typeof body.command !== "string") {
      return c.json({ error: "Field 'command' is required" }, 400);
    }
    if (!body.tenantId || typeof body.tenantId !== "string") {
      return c.json({ error: "Field 'tenantId' is required" }, 400);
    }
    if (!body.userId || typeof body.userId !== "string") {
      return c.json({ error: "Field 'userId' is required" }, 400);
    }

    const result = await registry.execute(body.command, {
      tenantId: body.tenantId,
      userId: body.userId,
      sessionId: body.sessionId,
    });

    const status = result.status === "error" ? 400 : 200;
    return c.json(result, status);
  });

  return commands;
}
