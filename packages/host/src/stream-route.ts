/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { Hono } from "hono";
import { streamText } from "hono/streaming";
import { runCompactionIfNeeded } from "./compaction.js";
import type { Message, TransformContextFn, Usage } from "@agentrail/runtime-core";
import { isRuntimeError } from "@agentrail/runtime-core";
import type { SandboxManager } from "@agentrail/sandbox";
import type { OrchestrationManager } from "@agentrail/orchestration";
import {
  mapOrchestrationEvent,
  TRACE_PERSISTED_EVENT_TYPES,
  wrapTraceEvent,
  type AgentrailContextUsageEvent,
  type AgentrailErrorEvent,
  type WorkflowTraceEventEnvelope,
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
  handleResolvedRequest?: (
    context: AgentrailResolvedStreamContext,
  ) => Promise<boolean> | boolean;
  /**
   * Optional observer called after each SSE event is written, for events whose
   * type is in TRACE_PERSISTED_EVENT_TYPES. Fire-and-forget; must not throw.
   * Intended for trace persistence in application layers (e.g. playground-server).
   */
  onTraceEvent?: (
    context: { tenantId: string; sessionId: string; sessionDir: string },
    envelope: WorkflowTraceEventEnvelope,
  ) => void;
}

export interface AgentrailResolvedStreamContext {
  request: StreamRequest;
  agentId: string;
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionDir: string;
  signal: AbortSignal;
  sessionStore: AgentrailSessionStore;
  uploadedFiles: AttachmentFile[];
  writeEvent: (event: object) => Promise<void>;
  persistTurn: (messages: Message[], usage: Usage) => Promise<void>;
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
    const sandboxReady = options.sandboxManager.ensureSandbox(sid, tenantId, userId);

    let forwardSubAgentEvent: (event: object) => void = () => {};
    let preloadedProfile: AgentrailProfile | null | undefined;
    if (!options.handleResolvedRequest) {
      preloadedProfile = await options.resolveProfile(
        agentId,
        { tenantId, userId, sessionId: sid, sessionDir },
        (event) => forwardSubAgentEvent(event),
      );
      if (!preloadedProfile) {
        return c.json({ error: `Agent profile '${agentId}' not found` }, 404);
      }
    }
    const abortController = new AbortController();
    c.req.raw.signal.addEventListener("abort", () => abortController.abort());
    c.header("X-Session-Id", sid);

    return streamText(c, async (textStream) => {
      const { forwardSubAgentEvent: forwardEvent, writeEvent } = createSseEventWriter(textStream);
      forwardSubAgentEvent = forwardEvent;

      let unsubscribeOrchestration: (() => void) | undefined;
      let traceSeq = 0;

      const maybeTraceEvent = (event: object) => {
        if (!options.onTraceEvent) return;
        const type = (event as { type?: string }).type;
        if (!type || !TRACE_PERSISTED_EVENT_TYPES.has(type)) return;
        const envelope = wrapTraceEvent("runtime", event as Record<string, unknown>, traceSeq++);
        try {
          options.onTraceEvent({ tenantId, sessionId: sid, sessionDir }, envelope);
        } catch {
          // observer must not break the stream
        }
      };

      const persistTurn = async (messages: Message[], usage: Usage) => {
        await Promise.all([
          options.sessionStore.appendMessages(tenantId, sid, messages),
          options.sessionStore.recordTurn(tenantId, sid, usage),
        ]);
        await options.onTurnPersisted?.(requestContext);
        await runPluginRequestHook(plugins, "onTurnPersisted", requestContext);
      };
      try {
        try {
          await sandboxReady;
        } catch (err) {
          const errorEvent: AgentrailErrorEvent = {
            type: "error",
            error: { message: `Sandbox initialization failed: ${String(err)}` },
          };
          await writeEvent(errorEvent);
          maybeTraceEvent(errorEvent);
          return;
        }

        if (options.handleResolvedRequest) {
          const handled = await options.handleResolvedRequest({
            request: {
              ...body,
              message: effectiveMessage,
              agentId,
              sessionId: sid,
            },
            agentId,
            tenantId,
            userId,
            sessionId: sid,
            sessionDir,
            signal: abortController.signal,
            sessionStore: options.sessionStore,
            uploadedFiles,
            writeEvent,
            persistTurn,
          });
          if (handled) {
            return;
          }
        }

        const profile = preloadedProfile ?? await options.resolveProfile(
          agentId,
          { tenantId, userId, sessionId: sid, sessionDir },
          (event) => forwardSubAgentEvent(event),
        );
        if (!profile) {
          const errorEvent: AgentrailErrorEvent = {
            type: "error",
            error: {
              message: `Agent profile '${agentId}' not found`,
            },
          };
          await writeEvent(errorEvent);
          return;
        }

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
        await runCompactionIfNeeded(
          options.sessionStore,
          tenantId,
          sid,
          allMessages,
          options.summarize,
          options.compaction,
          {
            workspaceSnapshot: await options.sandboxManager
              .listWorkspace(sid)
              .catch(() => undefined),
            onBeforeCompact: async () => {
              await writeEvent({ type: "context_compaction_start" });
              maybeTraceEvent({ type: "context_compaction_start" });
            },
            onAfterCompact: async () => {
              await writeEvent({ type: "context_compaction_end" });
              maybeTraceEvent({ type: "context_compaction_end" });
            },
          },
        );

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
            maybeTraceEvent(errorEvent);
            break;
          }

          await writeEvent(event);
          maybeTraceEvent(event);

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
              budgetUsedPct: Math.round((totalInputTokens / (profile?.contextWindow ?? 200_000)) * 100),
            };
            await writeEvent(usageEvent);
            break;
          }
        }

        if (capturedMessages && capturedUsage) {
          await persistTurn(capturedMessages, capturedUsage);
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
