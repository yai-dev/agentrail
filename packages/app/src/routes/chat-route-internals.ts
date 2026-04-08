/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { TransformContextFn } from "@agentrail/core";
import type { Context } from "hono";
import { createTransformContext } from "@/host/context-pipeline.js";
import { collectPluginContextProviders } from "@/host/plugins.js";
import type {
  AgentrailChatHandledResponse,
  AgentrailChatRequest,
  AgentrailPlugin,
  ContextProvider,
} from "@/host/types.js";

/** Builds a standardized handled-response payload for chat validation failures. */
export function makeChatValidationError(message: string): AgentrailChatHandledResponse {
  return {
    status: 400,
    body: { error: message },
  };
}

/** Writes a handled chat response to the Hono context as JSON. */
export function respondHandledJson(context: Context, handled: AgentrailChatHandledResponse) {
  switch (handled.status ?? 200) {
    case 200:
      return context.json(handled.body, 200);
    case 201:
      return context.json(handled.body, 201);
    case 202:
      return context.json(handled.body, 202);
    case 400:
      return context.json(handled.body, 400);
    case 401:
      return context.json(handled.body, 401);
    case 403:
      return context.json(handled.body, 403);
    case 404:
      return context.json(handled.body, 404);
    case 409:
      return context.json(handled.body, 409);
    case 422:
      return context.json(handled.body, 422);
    case 500:
      return context.json(handled.body, 500);
  }
}

/** Validates the incoming chat request body and returns a handled error when invalid. */
export function validateChatRequest(
  request: AgentrailChatRequest,
): AgentrailChatHandledResponse | null {
  if (!request.message || typeof request.message !== "string") {
    return makeChatValidationError("Field 'message' is required and must be a string");
  }
  if (!request.tenantId || typeof request.tenantId !== "string") {
    return makeChatValidationError("Field 'tenantId' is required");
  }
  if (!request.userId || typeof request.userId !== "string") {
    return makeChatValidationError("Field 'userId' is required");
  }

  return null;
}

export async function resolveChatTransformContext(
  options: {
    getTransformContext?: (context: {
      tenantId: string;
      userId: string;
      sessionId: string;
    }) => Promise<TransformContextFn> | TransformContextFn;
    getContextProviders?: (context: {
      tenantId: string;
      userId: string;
      sessionId: string;
    }) => Promise<ContextProvider[]> | ContextProvider[];
    contextProviders?: ContextProvider[];
  },
  plugins: AgentrailPlugin[],
  context: {
    tenantId: string;
    userId: string;
    sessionId: string;
  },
): Promise<TransformContextFn> {
  if (options.getTransformContext) {
    return options.getTransformContext(context);
  }

  return createTransformContext(
    collectPluginContextProviders(
      plugins,
      options.getContextProviders
        ? await options.getContextProviders(context)
        : (options.contextProviders ?? []),
    ),
    context,
  );
}
