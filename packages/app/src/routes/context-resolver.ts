/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { TransformContextFn } from "@agentrail/core";
import { createTransformContext } from "@/host/context-pipeline.js";
import { collectPluginContextProviders } from "@/host/plugins.js";
import type { AgentrailPlugin, ContextProvider } from "@/host/types.js";

interface ResolveTransformContextOptions {
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
}

/**
 * Resolves the transform context function for a request. Delegates to
 * `getTransformContext` when provided; otherwise assembles one from the
 * merged static and dynamic context providers.
 */
export async function resolveTransformContext(
  options: ResolveTransformContextOptions,
  plugins: AgentrailPlugin[],
  context: { tenantId: string; userId: string; sessionId: string },
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
