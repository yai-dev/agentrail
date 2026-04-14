/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  AfterToolCallEvent,
  AgentrailPlugin,
  AgentrailRequestLifecycleContext,
  BeforeToolCallEvent,
} from "@agentrail/app";

type TimerMap = Map<string, number>;

function requestKey(ctx: AgentrailRequestLifecycleContext): string {
  return `${ctx.sessionId}:${ctx.kind}`;
}

/**
 * An observability plugin that logs request lifecycle and tool call timings.
 * It does not modify or block any requests — pure observation.
 */
export function createObservabilityPlugin(): AgentrailPlugin {
  const requestStartTimes: TimerMap = new Map();

  return {
    name: "observability-hooks",

    onRequestStart(ctx: AgentrailRequestLifecycleContext): void {
      const key = requestKey(ctx);
      requestStartTimes.set(key, Date.now());
      console.log(
        `[hooks] → request start  agent=${ctx.agentId} session=${ctx.sessionId} kind=${ctx.kind}`,
      );
    },

    onRequestEnd(ctx: AgentrailRequestLifecycleContext): void {
      const key = requestKey(ctx);
      const start = requestStartTimes.get(key);
      requestStartTimes.delete(key);
      const elapsed = start !== undefined ? `${Date.now() - start}ms` : "?ms";
      console.log(
        `[hooks] ← request end    agent=${ctx.agentId} session=${ctx.sessionId} elapsed=${elapsed}`,
      );
    },

    onBeforeToolCall(event: BeforeToolCallEvent): { action: "allow" } {
      const args = JSON.stringify(event.input);
      console.log(`[hooks]   tool call      name=${event.toolName} input=${args}`);
      return { action: "allow" };
    },

    onAfterToolCall(event: AfterToolCallEvent): void {
      console.log(`[hooks]   tool result    name=${event.toolName} durationMs=${event.durationMs}`);
    },
  };
}
