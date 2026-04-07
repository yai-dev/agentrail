/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { AgentrailSessionStore } from "@agentrail/app";
import type { SessionRef } from "@agentrail/core";
import type { ExtendedSseEvent } from "@agentrail/capabilities";
import { DEFAULT_HOSTED_AGENT_ID, createDefaultAgent } from "./default-agent.js";

export async function getAgent(
  agentId: string,
  tenantId: string,
  userId: string,
  sessionId: string,
  sessionRef: SessionRef,
  sessionStore: AgentrailSessionStore,
  onSubAgentEvent?: (event: ExtendedSseEvent) => void,
) {
  if (agentId === DEFAULT_HOSTED_AGENT_ID) {
    return createDefaultAgent(
      tenantId,
      userId,
      sessionId,
      sessionRef,
      sessionStore,
      onSubAgentEvent,
    );
  }
  return undefined;
}

export const DEFAULT_AGENT_ID = DEFAULT_HOSTED_AGENT_ID;

export { createDefaultAgent };
