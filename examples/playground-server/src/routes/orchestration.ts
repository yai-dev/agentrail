/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createSessionRef } from "@agentrail/core";
import type { OrchestrationAgent, OrchestrationEvent } from "@agentrail/capabilities";
import { createFilesystemOrchestrationPersistence } from "@agentrail/capabilities";
import { Hono } from "hono";
import { config } from "@/config.js";

const orchestration = new Hono();

interface OrchestrationHistoryResponse {
  run: {
    id: string;
    status: "running" | "completed" | "failed";
    createdAt: string;
    updatedAt: string;
  } | null;
  agents: Array<{
    id: string;
    displayName?: string;
    role: string;
    status: OrchestrationAgent["status"];
    createdAt: string;
    updatedAt: string;
    closedAt?: string;
    lastJob?: OrchestrationAgent["lastJob"];
    mailbox?: {
      processedEventCount: number;
      closeRequested: {
        reason?: string;
        occurredAt: string;
      } | null;
    };
  }>;
  events: OrchestrationEvent[];
}

/** GET /api/sessions/:sessionId/orchestration?tenantId=default
 *  Returns the current orchestration state for a session.
 */
orchestration.get("/:sessionId/orchestration", async (c) => {
  const { sessionId } = c.req.param();
  const tenantId = c.req.query("tenantId") ?? "default";

  try {
    const persistence = createFilesystemOrchestrationPersistence(
      config.dataDir,
      createSessionRef(tenantId, sessionId),
    );
    const [{ snapshot }, events] = await Promise.all([
      persistence.recoverState(),
      persistence.loadEvents(),
    ]);

    const agents = Object.values(snapshot?.agents ?? {}) as OrchestrationAgent[];
    const agentStates = await Promise.all(
      agents.map(async (agent) => ({
        agent,
        mailboxState: await persistence.loadMailboxState(agent.id),
      })),
    );

    const activeRun = snapshot
      ? (Object.values(snapshot.runs).find((r) => r.status === "running") ??
        Object.values(snapshot.runs)[0])
      : undefined;
    const response: OrchestrationHistoryResponse = {
      run: activeRun
        ? {
            id: activeRun.id,
            status: activeRun.status,
            createdAt: activeRun.createdAt,
            updatedAt: activeRun.updatedAt,
          }
        : null,
      agents: agentStates.map(({ agent, mailboxState }) => ({
        id: agent.id,
        displayName: agent.displayName,
        role: agent.role,
        status: agent.status,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
        closedAt: agent.closedAt,
        lastJob: agent.lastJob,
        mailbox: {
          processedEventCount: mailboxState.processedEventCount,
          closeRequested: mailboxState.closeRequested,
        },
      })),
      events,
    };

    return c.json(response);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error }, 500);
  }
});

export { orchestration };
