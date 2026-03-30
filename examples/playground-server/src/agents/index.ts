/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { DEFAULT_HOSTED_AGENT_ID, createDefaultAgent } from "./default-agent.js";
import type { ExtendedSseEvent } from "@agentrail/skills";

export async function getAgent(
  agentId: string,
  tenantId: string,
  userId: string,
  sessionId: string,
  sessionDir: string,
  onSubAgentEvent?: (event: ExtendedSseEvent) => void
) {
  if (agentId === DEFAULT_HOSTED_AGENT_ID) {
    return createDefaultAgent(tenantId, userId, sessionId, sessionDir, onSubAgentEvent);
  }
  return undefined;
}

export const DEFAULT_AGENT_ID = DEFAULT_HOSTED_AGENT_ID;

export { createDefaultAgent };
