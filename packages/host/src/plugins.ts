/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  AgentrailChatHandledResponse,
  AgentrailChatRequestContext,
  AgentrailPlugin,
  AgentrailRequestLifecycleContext,
  AttachmentFile,
  AttachmentHandler,
  AttachmentHandlerResult,
  ContextProvider,
} from "./types.js";

type RequestHookName =
  | "onRequestStart"
  | "onRequestEnd"
  | "onTurnPersisted";

export function collectPluginContextProviders(
  plugins: AgentrailPlugin[],
  baseProviders: ContextProvider[] = [],
): ContextProvider[] {
  return [
    ...baseProviders,
    ...plugins.flatMap((plugin) => plugin.contextProviders ?? []),
  ];
}

export async function runPluginLifecycle(
  plugins: AgentrailPlugin[],
  phase: "start" | "stop",
): Promise<void> {
  for (const plugin of plugins) {
    await plugin[phase]?.();
  }
}

export async function runPluginRequestHook(
  plugins: AgentrailPlugin[],
  hook: RequestHookName,
  context: AgentrailRequestLifecycleContext,
): Promise<void> {
  for (const plugin of plugins) {
    await plugin[hook]?.(context);
  }
}

export async function runPluginChatRequestInterceptors(
  plugins: AgentrailPlugin[],
  context: AgentrailChatRequestContext,
): Promise<AgentrailChatHandledResponse | null> {
  for (const plugin of plugins) {
    const result = await plugin.interceptChatRequest?.(context);
    if (result) {
      return result;
    }
  }

  return null;
}

export async function runAttachmentHandlers(
  files: AttachmentFile[],
  plugins: AgentrailPlugin[],
  fallbackHandler?: AttachmentHandler,
): Promise<AttachmentHandlerResult | null> {
  const results: AttachmentHandlerResult[] = [];

  for (const plugin of plugins) {
    if (!plugin.attachmentHandler) {
      continue;
    }

    const result = await plugin.attachmentHandler(files);
    if (result?.contextText) {
      results.push(result);
    }
  }

  if (fallbackHandler) {
    const result = await fallbackHandler(files);
    if (result?.contextText) {
      results.push(result);
    }
  }

  if (results.length === 0) {
    return null;
  }

  return {
    contextText: results
      .map((result) => result.contextText?.trim())
      .filter((text): text is string => Boolean(text))
      .join("\n\n"),
  };
}
