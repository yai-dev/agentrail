/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SessionRef } from "@agentrail/core";
import type { Message, Usage } from "@agentrail/core";
import { Hono } from "hono";
import { DeepResearchCoordinator } from "./coordinator.js";
import type { DeepResearchRuntimeConfig } from "./runtime.js";
import type { DeepResearchEvent, DeepResearchState } from "./types.js";

export interface DeepResearchSessionStore {
  getOrCreate(
    tenantId: string,
    userId: string,
    agentId: string,
    sessionId?: string,
  ): Promise<{ sessionId: string; sessionRef: SessionRef }>;
  loadMessages(tenantId: string, sessionId: string): Promise<Message[]>;
  appendMessages(tenantId: string, sessionId: string, messages: Message[]): Promise<void>;
  recordTurn(tenantId: string, sessionId: string, usage: Usage): Promise<void>;
}

export interface DeepResearchBlockingRunInput {
  tenantId: string;
  userId: string;
  query: string;
  sessionId?: string;
  sessionStore: DeepResearchSessionStore;
  runtime: DeepResearchRuntimeConfig;
  agentId?: string;
  persistTurn?: (messages: Message[], usage: Usage) => Promise<void>;
}

export interface DeepResearchBlockingRunResult {
  sessionId: string;
  state: DeepResearchState;
}

export type DeepResearchStreamingEvent = DeepResearchEvent | Record<string, unknown>;

export interface DeepResearchStreamingRunInput extends DeepResearchBlockingRunInput {
  onEvent?: (event: DeepResearchStreamingEvent) => Promise<void> | void;
}

export interface DeepResearchRunRouteOptions {
  runtime: DeepResearchRuntimeConfig;
  sessionStore: DeepResearchSessionStore;
  agentId?: string;
}

interface DeepResearchRunRequest {
  query: string;
  tenantId: string;
  userId: string;
  sessionId?: string;
}

export async function runDeepResearchBlocking(
  input: DeepResearchBlockingRunInput,
): Promise<DeepResearchBlockingRunResult> {
  return runDeepResearchInternal(input);
}

export async function runDeepResearchStreaming(
  input: DeepResearchStreamingRunInput,
): Promise<DeepResearchBlockingRunResult> {
  return runDeepResearchInternal(input, (event) => input.onEvent?.(event));
}

async function runDeepResearchInternal(
  input: DeepResearchBlockingRunInput,
  emit?: (event: DeepResearchStreamingEvent) => Promise<void> | void,
): Promise<DeepResearchBlockingRunResult> {
  const sessionInfo = await input.sessionStore.getOrCreate(
    input.tenantId,
    input.userId,
    input.agentId ?? "deep-research",
    input.sessionId,
  );
  const sessionId = sessionInfo.sessionId;
  const sessionRef = sessionInfo.sessionRef;
  const history = await input.sessionStore.loadMessages(input.tenantId, sessionId);

  const coordinator = new DeepResearchCoordinator({
    tenantId: input.tenantId,
    userId: input.userId,
    sessionId,
    sessionRef,
    query: input.query,
    history,
    runtime: input.runtime,
  });

  const state = emit ? await coordinator.runStreaming(emit) : await coordinator.runBlocking();
  await persistDeepResearchTurn(
    input.persistTurn ? undefined : input.sessionStore,
    input.runtime.model.provider,
    input.runtime.model.modelId,
    input.tenantId,
    sessionId,
    input.query,
    state.reportMarkdown,
    input.persistTurn,
  );

  return {
    sessionId,
    state,
  };
}

export function createDeepResearchRunRoute(options: DeepResearchRunRouteOptions): Hono {
  const run = new Hono();

  run.post("/", async (c) => {
    let body: DeepResearchRunRequest;
    try {
      body = await c.req.json<DeepResearchRunRequest>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { query, tenantId, userId, sessionId } = body;

    if (!query || typeof query !== "string") {
      return c.json({ error: "Field 'query' is required and must be a string" }, 400);
    }
    if (!tenantId || typeof tenantId !== "string") {
      return c.json({ error: "Field 'tenantId' is required" }, 400);
    }
    if (!userId || typeof userId !== "string") {
      return c.json({ error: "Field 'userId' is required" }, 400);
    }

    try {
      const result = await runDeepResearchBlocking({
        tenantId,
        userId,
        query,
        sessionId,
        sessionStore: options.sessionStore,
        runtime: options.runtime,
        agentId: options.agentId,
      });

      return c.json({
        sessionId: result.sessionId,
        runId: result.state.run.id,
        state: result.state,
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  return run;
}

async function persistDeepResearchTurn(
  sessionStore: Pick<DeepResearchSessionStore, "appendMessages" | "recordTurn"> | undefined,
  provider: string,
  modelId: string,
  tenantId: string,
  sessionId: string,
  userText: string,
  reportMarkdown: string,
  persistTurn?: (messages: Message[], usage: Usage) => Promise<void>,
): Promise<void> {
  const timestamp = Date.now();
  const usage = zeroUsage();
  const messages: Message[] = [
    {
      role: "user",
      content: userText,
      timestamp,
    },
    {
      role: "assistant",
      content: [{ type: "text", text: reportMarkdown }],
      provider,
      modelId,
      usage,
      stopReason: "stop",
      timestamp: timestamp + 1,
    },
  ];

  if (persistTurn) {
    await persistTurn(messages, usage);
    return;
  }

  if (!sessionStore) {
    throw new Error("Deep research turn persistence requires either sessionStore or persistTurn.");
  }

  await Promise.all([
    sessionStore.appendMessages(tenantId, sessionId, messages),
    sessionStore.recordTurn(tenantId, sessionId, usage),
  ]);
}

function zeroUsage(): Usage {
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
