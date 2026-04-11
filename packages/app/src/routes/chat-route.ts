/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { randomUUID } from "node:crypto";
import type { SessionRef } from "@agentrail/core";
import type { Message, TransformContextFn } from "@agentrail/core";
import { Hono } from "hono";
import {
  resolveChatTransformContext,
  respondHandledJson,
  validateChatRequest,
} from "@/routes/chat-route-internals.js";
import { TRACE_PERSISTED_EVENT_TYPES, wrapTraceEvent, type WorkflowTraceEventEnvelope } from "@/events/index.js";
import { createReactiveCompactionController, type SummarizeMessagesFn } from "@/host/reactive-compaction.js";
import { runCompactionStep } from "@/routes/compaction-runner.js";
import { buildToolInterceptor, runPluginChatRequestInterceptors, runPluginRequestHook } from "@/host/plugins.js";
import type {
  AgentrailChatHandledResponse,
  AgentrailChatRequest,
  AgentrailChatSuccessBody,
  AgentrailPlugin,
  AgentrailProfile,
  AgentrailProfileContext,
  AgentrailRequestLifecycleContext,
  AgentrailSessionStore,
  ContextProvider,
  PluginErrorHandler,
} from "@/host/types.js";

/**
 * Configuration for the JSON chat route factory.
 *
 * @see {@link https://agentrail.run/reference/host-primitives}
 */
export interface AgentrailChatRouteOptions {
  /** Default profile ID used when the request omits `agentId`. */
  defaultAgentId: string;
  /** Session store implementation used for history persistence and compaction. */
  sessionStore: AgentrailSessionStore;
  /** Summarizer used when chat history needs compaction. */
  summarize: SummarizeMessagesFn;
  /** Token thresholds that decide when to compact history. */
  compaction: {
    triggerTokens: number;
    minMessages: number;
    reactive?: {
      enabled?: boolean;
      microTriggerPct?: number;
      fullTriggerPct?: number;
      preserveRecentApiRounds?: number;
      microBatchGroups?: number;
      maxReactiveCompactionsPerRequest?: number;
    };
  };
  /** Resolves a hosted profile for the given request context. */
  resolveProfile(
    agentId: string,
    context: {
      tenantId: string;
      userId: string;
      sessionId: string;
      sessionRef: SessionRef;
      sessionStore: AgentrailSessionStore;
    },
    onSubAgentEvent?: (event: object) => void,
  ): Promise<AgentrailProfile | null>;
  /** Optional plugins that can intercept requests and observe lifecycle events. */
  plugins?: AgentrailPlugin[];
  /**
   * Called whenever a plugin hook throws an isolated error.
   * Defaults to `console.warn`. May be async.
   * @see {@link PluginErrorHandler}
   */
  onPluginError?: PluginErrorHandler;
  /** Static context providers prepended before conversation history. */
  contextProviders?: ContextProvider[];
  /** Dynamic context-provider resolver invoked per request. */
  getContextProviders?: (context: {
    tenantId: string;
    userId: string;
    sessionId: string;
  }) => Promise<ContextProvider[]> | ContextProvider[];
  /** Dynamic transform-context resolver invoked per request. */
  getTransformContext?: (context: {
    tenantId: string;
    userId: string;
    sessionId: string;
  }) => Promise<TransformContextFn> | TransformContextFn;
  /** Optional short-circuit hook that handles a fully resolved request directly. */
  handleResolvedRequest?: (context: {
    request: AgentrailChatRequest;
    agentId: string;
    tenantId: string;
    userId: string;
    sessionId: string;
    sessionRef: SessionRef;
    signal: AbortSignal;
    sessionStore: AgentrailSessionStore;
  }) => Promise<AgentrailChatHandledResponse | null> | AgentrailChatHandledResponse | null;
  /** Optional callback invoked once request processing begins. */
  onRequestStart?: (context: AgentrailRequestLifecycleContext) => void | Promise<void>;
  /** Optional callback invoked when request processing ends. */
  onRequestEnd?: (context: AgentrailRequestLifecycleContext) => void | Promise<void>;
  /** Optional callback invoked after the turn has been persisted. */
  onTurnPersisted?: (context: AgentrailRequestLifecycleContext) => void | Promise<void>;
  /**
   * Optional observer called for trace-worthy events on the `/chat` route.
   *
   * Because `/chat` uses `agent.invoke()` (non-streaming), granularity is
   * coarser than the `/stream` route: only synthetic `agent_start` and
   * `agent_end` events (plus errors) are emitted, not individual turn/tool
   * events. Use `/stream` when fine-grained telemetry is required.
   *
   * Fire-and-forget; must not throw.
   */
  onTraceEvent?: (
    context: { tenantId: string; sessionId: string; sessionRef: SessionRef },
    envelope: WorkflowTraceEventEnvelope,
  ) => void;
}

/**
 * Creates the hosted JSON chat route.
 *
 * The route validates input, resolves or creates a session, applies request
 * context, optionally compacts history, runs the agent, and persists the turn.
 *
 * @see {@link https://agentrail.run/reference/host-primitives}
 */
export function createChatRoute(options: AgentrailChatRouteOptions): Hono {
  const plugins = options.plugins ?? [];
  const onPluginError = options.onPluginError;
  const route = new Hono();

  function emitTraceEvent(
    ctx: { tenantId: string; sessionId: string; sessionRef: SessionRef },
    event: Record<string, unknown>,
    seq: number,
    requestTraceId?: string,
  ): void {
    if (!options.onTraceEvent) return;
    const type = String(event["type"] ?? "");
    if (!TRACE_PERSISTED_EVENT_TYPES.has(type)) return;
    const envelope = wrapTraceEvent("runtime", event, seq, requestTraceId);
    try {
      options.onTraceEvent(ctx, envelope);
    } catch {
      // observer must not break the request
    }
  }

  route.post("/", async (c) => {
    let request: AgentrailChatRequest;
    try {
      request = await c.req.json<AgentrailChatRequest>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const validationError = validateChatRequest(request);
    if (validationError) {
      return c.json(validationError.body, validationError.status ?? 400);
    }

    const signal = c.req.raw.signal;
    const agentId = request.agentId ?? options.defaultAgentId;
    const prehandled = await runPluginChatRequestInterceptors(plugins, {
      kind: "chat",
      request,
      agentId,
      signal,
    }, onPluginError);
    if (prehandled) {
      return respondHandledJson(c, prehandled);
    }

    let activityStarted = false;
    let requestContext: AgentrailRequestLifecycleContext | null = null;

    try {
      const sessionInfo = await options.sessionStore.getOrCreate(
        request.tenantId,
        request.userId,
        agentId,
        request.sessionId,
      );
      const sessionId = sessionInfo.sessionId;
      const sessionRef = sessionInfo.sessionRef;

      requestContext = {
        kind: "chat",
        tenantId: request.tenantId,
        userId: request.userId,
        sessionId,
        agentId,
      };

      await options.onRequestStart?.(requestContext);
      await runPluginRequestHook(plugins, "onRequestStart", requestContext, onPluginError);
      activityStarted = true;

      const handled = options.handleResolvedRequest
        ? await options.handleResolvedRequest({
            request,
            agentId,
            tenantId: request.tenantId,
            userId: request.userId,
            sessionId,
            sessionRef,
            signal,
            sessionStore: options.sessionStore,
          })
        : null;

      if (handled) {
        await options.onTurnPersisted?.(requestContext);
        await runPluginRequestHook(plugins, "onTurnPersisted", requestContext, onPluginError);
        return respondHandledJson(c, handled);
      }

      const profile = await options.resolveProfile(agentId, {
        tenantId: request.tenantId,
        userId: request.userId,
        sessionId,
        sessionRef,
        sessionStore: options.sessionStore,
      });
      if (!profile) {
        return c.json({ error: `Agent profile '${agentId}' not found` }, 404);
      }

      // Pass a no-op sub-agent event handler so that capabilities relying on
      // onSubAgentEvent (e.g. orchestration tools) work on the /chat path too.
      // Events are discarded here — use the /stream endpoint for live event delivery.
      const profileCtx: AgentrailProfileContext = {
        tenantId: request.tenantId,
        userId: request.userId,
        sessionId,
        sessionRef,
        sessionStore: options.sessionStore,
      };
      const agent = await profile.createAgent(
        profileCtx,
        () => { /* sub-agent events are not forwarded on the JSON /chat route */ },
      );
      const capProviders = (await profile.getContextProviders?.(profileCtx)) ?? [];
      const profileTransform = await profile.getTransformContext?.(profileCtx);
      const history = await runCompactionStep(
        options.sessionStore,
        request.tenantId,
        sessionId,
        options.summarize,
        options.compaction,
      );
      const transformContext = await resolveChatTransformContext(
        {
          ...options,
          baseTransformContext: profileTransform,
          contextProviders: [...(options.contextProviders ?? []), ...capProviders],
        },
        plugins,
        {
          tenantId: request.tenantId,
          userId: request.userId,
          sessionId,
        },
      );

      const traceCtx = { tenantId: request.tenantId, sessionId, sessionRef };
      const traceId = randomUUID();
      let traceSeq = 0;

      emitTraceEvent(traceCtx, { type: "agent_start", agentId, traceId }, traceSeq++, traceId);

      let result: Awaited<ReturnType<typeof agent.invoke>>;
      try {
        const reactiveCompaction = createReactiveCompactionController({
          summarize: options.summarize,
          contextWindow: profile.contextWindow,
          config: options.compaction.reactive,
        });
        result = await agent.invoke(request.message, {
          messages: history,
          signal,
          transformContext,
          reactiveCompaction,
          toolInterceptor: buildToolInterceptor(plugins, profileCtx, onPluginError),
        });
      } catch (invokeError) {
        emitTraceEvent(
          traceCtx,
          {
            type: "error",
            traceId,
            error: { message: invokeError instanceof Error ? invokeError.message : String(invokeError) },
          },
          traceSeq++,
          traceId,
        );
        throw invokeError;
      }

      emitTraceEvent(
        traceCtx,
        {
          type: "agent_end",
          agentId,
          traceId,
          stopReason: result.stopReason,
          usage: result.usage,
        },
        traceSeq++,
        traceId,
      );

      await Promise.all([
        options.sessionStore.appendMessages(request.tenantId, sessionId, result.messages),
        options.sessionStore.recordTurn(request.tenantId, sessionId, result.usage),
      ]);
      await options.onTurnPersisted?.(requestContext);
      await runPluginRequestHook(plugins, "onTurnPersisted", requestContext, onPluginError);

      const body: AgentrailChatSuccessBody = {
        sessionId,
        text: result.text,
        usage: result.usage,
        stopReason: result.stopReason,
      };
      return c.json(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    } finally {
      if (activityStarted && requestContext) {
        await options.onRequestEnd?.(requestContext);
        await runPluginRequestHook(plugins, "onRequestEnd", requestContext, onPluginError);
      }
    }
  });

  return route;
}
