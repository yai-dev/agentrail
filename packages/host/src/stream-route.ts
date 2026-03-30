/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { Hono } from "hono";
import { streamText } from "hono/streaming";
import { estimateMessageTokens } from "@agentrail/memo";
import type { Message, TransformContextFn, Usage } from "@agentrail/runtime-core";
import { isRuntimeError } from "@agentrail/runtime-core";
import type { SandboxManager } from "@agentrail/sandbox";
import type { OrchestrationManager } from "@agentrail/orchestration";
import {
  mapOrchestrationEvent,
  type AgentrailContextUsageEvent,
  type AgentrailErrorEvent,
} from "@agentrail/events";
import type {
  AgentrailProfile,
  AgentrailRequestLifecycleContext,
  AgentrailSessionStore,
  AttachmentFile,
  AttachmentHandler,
  AgentrailPlugin,
  ContextProvider,
} from "./types.js";
import {
  runPluginRequestHook,
} from "./plugins.js";
import {
  buildEffectiveMessage,
  createSseEventWriter,
  persistUploadedFiles,
  resolveStreamTransformContext,
  type StreamRequest,
  validateStreamRequest,
} from "./stream-route-internals.js";

export interface AgentrailStreamRouteOptions {
  dataDir: string;
  defaultAgentId: string;
  sessionStore: AgentrailSessionStore;
  sandboxManager: SandboxManager;
  resolveProfile(
    agentId: string,
    context: {
      tenantId: string;
      userId: string;
      sessionId: string;
      sessionDir: string;
    },
    onSubAgentEvent?: (event: object) => void,
  ): Promise<AgentrailProfile | null>;
  summarize(messages: Message[]): Promise<string>;
  compaction: {
    triggerTokens: number;
    minMessages: number;
  };
  plugins?: AgentrailPlugin[];
  contextProviders?: ContextProvider[];
  getContextProviders?: (context: {
    tenantId: string;
    userId: string;
    sessionId: string;
  }) => Promise<ContextProvider[]> | ContextProvider[];
  getTransformContext?: (context: {
    tenantId: string;
    userId: string;
    sessionId: string;
  }) => Promise<TransformContextFn> | TransformContextFn;
  attachmentHandler?: AttachmentHandler;
  onRequestStart?: (
    context: AgentrailRequestLifecycleContext,
  ) => void | Promise<void>;
  onRequestEnd?: (
    context: AgentrailRequestLifecycleContext,
  ) => void | Promise<void>;
  onTurnPersisted?: (
    context: AgentrailRequestLifecycleContext,
  ) => void | Promise<void>;
  getOrchestrationManager?: (context: {
    tenantId: string;
    userId: string;
    sessionId: string;
  }) => Promise<OrchestrationManager>;
}

export function createStreamRoute(
  options: AgentrailStreamRouteOptions,
): Hono {
  const plugins = options.plugins ?? [];
  const route = new Hono();

  route.post("/", async (c) => {
    let body: StreamRequest;
    try {
      body = await c.req.json<StreamRequest>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const {
      message,
      agentId = options.defaultAgentId,
      tenantId,
      userId,
      sessionId,
      attachments,
    } = body;

    const validation = validateStreamRequest(body);
    if (!validation.valid) {
      return c.json({ error: validation.error }, 400);
    }

    const sessionInfo = await options.sessionStore.getOrCreate(
      tenantId,
      userId,
      agentId,
      sessionId,
    );
    const sid = sessionInfo.sessionId;
    const sessionDir = options.sessionStore.getSessionDir(tenantId, sid);
    const requestContext: AgentrailRequestLifecycleContext = {
      kind: "stream",
      tenantId,
      userId,
      sessionId: sid,
      agentId,
    };

    const uploadedFiles: AttachmentFile[] = await persistUploadedFiles(
      options.dataDir,
      sid,
      attachments,
    );
    const effectiveMessage = await buildEffectiveMessage(
      message,
      uploadedFiles,
      plugins,
      options.attachmentHandler,
    );

    await options.onRequestStart?.(requestContext);
    await runPluginRequestHook(plugins, "onRequestStart", requestContext);
    void options.sandboxManager.ensureSandbox(sid, tenantId, userId);

    let forwardSubAgentEvent: (event: object) => void = () => {};
    const profile = await options.resolveProfile(
      agentId,
      { tenantId, userId, sessionId: sid, sessionDir },
      (event) => forwardSubAgentEvent(event),
    );
    if (!profile) {
      return c.json({ error: `Agent profile '${agentId}' not found` }, 404);
    }

    const abortController = new AbortController();
    c.req.raw.signal.addEventListener("abort", () => abortController.abort());
    c.header("X-Session-Id", sid);

    return streamText(c, async (textStream) => {
      const { forwardSubAgentEvent: forwardEvent, writeEvent } = createSseEventWriter(textStream);
      forwardSubAgentEvent = forwardEvent;

      let unsubscribeOrchestration: (() => void) | undefined;
      try {
        const agent = await profile.createAgent(
          { tenantId, userId, sessionId: sid, sessionDir },
          (event) => forwardSubAgentEvent(event),
        );

        if (options.getOrchestrationManager) {
          const manager = await options.getOrchestrationManager({
            tenantId,
            userId,
            sessionId: sid,
          });
          unsubscribeOrchestration = manager.subscribe(({ event }) => {
            const mapped = mapOrchestrationEvent(event);
            if (mapped) {
              void writeEvent(mapped);
            }
          });
        }

        const allMessages = await options.sessionStore.loadAllMessages(tenantId, sid);
        if (
          allMessages.length >= options.compaction.minMessages &&
          estimateMessageTokens(allMessages) > options.compaction.triggerTokens
        ) {
          await writeEvent({ type: "context_compaction_start" });
          await options.sessionStore.compactIfNeeded(
            tenantId,
            sid,
            options.summarize,
            {
              preloadedMessages: allMessages,
              triggerTokens: options.compaction.triggerTokens,
              workspaceSnapshot: await options.sandboxManager
                .listWorkspace(sid)
                .catch(() => undefined),
            },
          );
          await writeEvent({ type: "context_compaction_end" });
        }

        const history = await options.sessionStore.loadMessagesWithBudget(tenantId, sid);
        const transformContext = await resolveStreamTransformContext(
          options,
          plugins,
          { tenantId, userId, sessionId: sid },
        );

        const agentStream = agent.stream(effectiveMessage, {
          messages: history,
          signal: abortController.signal,
          transformContext,
        });

        let capturedMessages: Message[] | null = null;
        let capturedUsage: Usage | null = null;

        for await (const event of agentStream) {
          if (abortController.signal.aborted) break;

          if (isRuntimeError(event)) {
            const errorEvent: AgentrailErrorEvent = {
              type: "error",
              error: {
                message: (event.error as Error)?.message ?? "Unknown runtime error",
              },
            };
            await writeEvent(errorEvent);
            break;
          }

          await writeEvent(event);

          if (event.type === "agent_end") {
            capturedMessages = event.messages;
            capturedUsage = event.usage;

            const totalInputTokens =
              (event.usage.inputTokens ?? 0) +
              (event.usage.cacheReadTokens ?? 0) +
              (event.usage.cacheWriteTokens ?? 0);
            const usageEvent: AgentrailContextUsageEvent = {
              type: "context_usage",
              inputTokens: totalInputTokens,
              outputTokens: event.usage.outputTokens ?? 0,
              budgetUsedPct: Math.round((totalInputTokens / 200_000) * 100),
            };
            await writeEvent(usageEvent);
            break;
          }
        }

        if (capturedMessages && capturedUsage) {
          await Promise.all([
            options.sessionStore.appendMessages(tenantId, sid, capturedMessages),
            options.sessionStore.recordTurn(tenantId, sid, capturedUsage),
          ]);
          await options.onTurnPersisted?.(requestContext);
          await runPluginRequestHook(plugins, "onTurnPersisted", requestContext);
        }
      } finally {
        unsubscribeOrchestration?.();
        await options.onRequestEnd?.(requestContext);
        await runPluginRequestHook(plugins, "onRequestEnd", requestContext);
      }
    });
  });

  return route;
}
