/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  CreateManagedAgentInput,
  ManagedAgentInstance,
  OrchestrationEvent,
} from "@agentrail/capabilities";
import { createSubAgentProcess } from "@agentrail/capabilities";
import type { Message, Usage } from "@agentrail/core";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DeepResearchCoordinatorOptions } from "./coordinator.js";
import type { DeepResearchRun } from "./types.js";
import { nowIso } from "./utils.js";

export function getDeepResearchWorkerPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const extension = currentFile.endsWith(".ts") ? ".ts" : ".js";
  return join(dirname(currentFile), `./agents/deep-research-worker-entry${extension}`);
}

export function zeroUsage(): Usage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

export function summarizeHistory(history: Message[]): string {
  return history
    .slice(-8)
    .map((message) => {
      if (message.role === "user") {
        const text =
          typeof message.content === "string"
            ? message.content
            : message.content.map((block) => ("text" in block ? block.text : "")).join("");
        return `User: ${text}`;
      }

      if (message.role === "assistant") {
        const text = message.content
          .filter(
            (block): block is Extract<typeof block, { type: "text" }> => block.type === "text",
          )
          .map((block) => block.text)
          .join("\n");
        return `Assistant: ${text}`;
      }

      return null;
    })
    .filter((item): item is string => Boolean(item))
    .join("\n\n");
}

export function createRun(options: DeepResearchCoordinatorOptions, runId: string): DeepResearchRun {
  const timestamp = nowIso();
  return {
    id: runId,
    sessionId: options.sessionId,
    tenantId: options.tenantId,
    userId: options.userId,
    query: options.query,
    title: options.query.slice(0, 80),
    status: "running",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function mapDeepResearchOrchestrationEvent(
  event: OrchestrationEvent,
): Record<string, unknown> | null {
  switch (event.type) {
    case "run_started":
      return {
        type: "orchestration_run_start",
        runId: event.runId,
        initialTask: event.initialTask,
      };
    case "agent_spawned":
      return {
        type: "subagent_spawned",
        agent: {
          ...event.agent,
          createdAt: event.occurredAt,
          status: "idle",
        },
      };
    case "agent_status_changed":
      return {
        type: "subagent_status",
        agentId: event.agentId,
        status: event.status,
      };
    case "agent_job_started":
      return {
        type: "subagent_job_started",
        agentId: event.agentId,
        jobId: event.jobId,
        inputIds: event.inputIds,
      };
    case "agent_job_completed":
      return {
        type: "subagent_job_completed",
        agentId: event.agentId,
        job: event.job,
      };
    case "agent_job_failed":
      return {
        type: "subagent_job_failed",
        agentId: event.agentId,
        job: event.job,
      };
    case "agent_input_queued":
      return {
        type: "subagent_message",
        agentId: event.input.agentId,
        input: event.input,
      };
    case "wait_registered":
      return {
        type: "wait_registered",
        wait: event.wait,
      };
    case "wait_resolved":
      return {
        type: "wait_resolved",
        waitId: event.waitId,
        resolution: event.resolution,
      };
    case "agent_closed":
      return {
        type: "subagent_closed",
        agentId: event.close.agentId,
        reason: event.close.reason,
        finalStatus: "closed",
      };
    case "run_completed":
      return {
        type: "orchestration_run_complete",
        runId: event.runId,
        status: event.status,
        error: event.error,
      };
    default:
      return null;
  }
}

export async function createManagedDeepResearchAgent(
  options: DeepResearchCoordinatorOptions,
  input: CreateManagedAgentInput,
): Promise<ManagedAgentInstance> {
  return createSubAgentProcess({
    tenantId: options.tenantId,
    userId: options.userId,
    sessionId: options.sessionId,
    sessionRef: options.sessionRef,
    dataDir: options.runtime.dataDir,
    input,
    workerPath: getDeepResearchWorkerPath(),
    runtimeConfig: {
      input,
      runtime: options.runtime,
    },
    workerConfig: options.runtime.orchestration?.subagent,
  });
}
