/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { randomUUID } from "node:crypto";
import type {
  AgentInputEnvelope,
  ManagedAgentDeliveryResult,
  OrchestrationAgent,
  WaitAgentInput,
  WaitCondition,
  WaitMatch,
} from "./types.js";

export function normalizeWaitInput(input: WaitAgentInput): WaitAgentInput {
  const agentIds = [...new Set(input.agentIds ?? [input.agentId])];

  return {
    ...input,
    agentId: agentIds[0] ?? input.agentId,
    agentIds,
    match: normalizeWaitMatch(input.match),
  };
}

export function normalizeWaitMatch(match?: WaitMatch): WaitMatch {
  return match ?? "all";
}

export function getWaitTargetAgentIds(
  wait: Pick<WaitAgentInput, "agentId" | "agentIds">,
): string[] {
  return [...new Set(wait.agentIds ?? [wait.agentId])];
}

export function cloneAgent(agent: OrchestrationAgent): OrchestrationAgent {
  return JSON.parse(JSON.stringify(agent)) as OrchestrationAgent;
}

export function cloneWait(wait: WaitCondition): WaitCondition {
  return JSON.parse(JSON.stringify(wait)) as WaitCondition;
}

export const DISPLAY_NAME_WORDS = [
  "Atlas",
  "Echo",
  "Ember",
  "Harbor",
  "Iris",
  "Juniper",
  "Kite",
  "Lumen",
  "Mosaic",
  "Nova",
  "Orion",
  "Pioneer",
  "Quartz",
  "Rivet",
  "Solace",
  "Vector",
];

export function createDisplayName(
  runId: string,
  agentId: string,
  role: string,
  attempt: number,
): string {
  const seed = `${runId}:${agentId}:${role}:${randomUUID()}:${attempt}`;
  return DISPLAY_NAME_WORDS[hashString(seed) % DISPLAY_NAME_WORDS.length]!;
}

export function normalizeDeliveryResult(
  envelope: AgentInputEnvelope,
  result: ManagedAgentDeliveryResult | void,
  occurredAt: string,
): ManagedAgentDeliveryResult {
  if (result) {
    return {
      jobId: result.jobId,
      consumedInputIds:
        result.consumedInputIds.length > 0 ? result.consumedInputIds : [envelope.id],
      outcome: result.outcome,
      outputText: result.outputText,
      error: result.error,
    };
  }

  return {
    jobId: `job:${envelope.id}:${occurredAt}`,
    consumedInputIds: [envelope.id],
    outcome: "completed",
  };
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
