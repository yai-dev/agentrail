/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { Hono } from "hono";
import type { TransformContextFn } from "@agentrail/runtime-core";
import type {
  AgentrailChatRequest,
  AgentrailChatHandledResponse,
  AgentrailChatSuccessBody,
  AgentrailPlugin,
  AgentrailProfile,
  AgentrailRequestLifecycleContext,
  AgentrailSessionStore,
  ContextProvider,
} from "./types.js";
import {
  runPluginChatRequestInterceptors,
  runPluginRequestHook,
} from "./plugins.js";
import {
  respondHandledJson,
  resolveChatTransformContext,
  validateChatRequest,
} from "./chat-route-internals.js";

export interface AgentrailChatRouteOptions {
  defaultAgentId: string;
  sessionStore: AgentrailSessionStore;
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
  handleResolvedRequest?: (
    context: {
      request: AgentrailChatRequest;
      agentId: string;
      tenantId: string;
      userId: string;
      sessionId: string;
      sessionDir: string;
      signal: AbortSignal;
      sessionStore: AgentrailSessionStore;
    },
  ) => Promise<AgentrailChatHandledResponse | null> | AgentrailChatHandledResponse | null;
  onRequestStart?: (
    context: AgentrailRequestLifecycleContext,
  ) => void | Promise<void>;
  onRequestEnd?: (
    context: AgentrailRequestLifecycleContext,
  ) => void | Promise<void>;
  onTurnPersisted?: (
    context: AgentrailRequestLifecycleContext,
  ) => void | Promise<void>;
}

export function createChatRoute(options: AgentrailChatRouteOptions): Hono {
  const plugins = options.plugins ?? [];
  const route = new Hono();

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
    });
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
      const sessionDir = options.sessionStore.getSessionDir(request.tenantId, sessionId);

      requestContext = {
        kind: "chat",
        tenantId: request.tenantId,
        userId: request.userId,
        sessionId,
        agentId,
      };

      await options.onRequestStart?.(requestContext);
      await runPluginRequestHook(plugins, "onRequestStart", requestContext);
      activityStarted = true;

      const handled = options.handleResolvedRequest
        ? await options.handleResolvedRequest({
            request,
            agentId,
            tenantId: request.tenantId,
            userId: request.userId,
            sessionId,
            sessionDir,
            signal,
            sessionStore: options.sessionStore,
          })
        : null;

      if (handled) {
        await options.onTurnPersisted?.(requestContext);
        await runPluginRequestHook(plugins, "onTurnPersisted", requestContext);
        return respondHandledJson(c, handled);
      }

      const profile = await options.resolveProfile(agentId, {
        tenantId: request.tenantId,
        userId: request.userId,
        sessionId,
        sessionDir,
      });
      if (!profile) {
        return c.json({ error: `Agent profile '${agentId}' not found` }, 404);
      }

      const agent = await profile.createAgent({
        tenantId: request.tenantId,
        userId: request.userId,
        sessionId,
        sessionDir,
      });
      const history = await options.sessionStore.loadMessages(request.tenantId, sessionId);
      const transformContext = await resolveChatTransformContext(
        options,
        plugins,
        {
          tenantId: request.tenantId,
          userId: request.userId,
          sessionId,
        },
      );

      const result = await agent.invoke(request.message, {
        messages: history,
        signal,
        transformContext,
      });

      await Promise.all([
        options.sessionStore.appendMessages(request.tenantId, sessionId, result.messages),
        options.sessionStore.recordTurn(request.tenantId, sessionId, result.usage),
      ]);
      await options.onTurnPersisted?.(requestContext);
      await runPluginRequestHook(plugins, "onTurnPersisted", requestContext);

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
        await runPluginRequestHook(plugins, "onRequestEnd", requestContext);
      }
    }
  });

  return route;
}
