/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { composeTransformContexts, createTransformContext } from "@/host/context-pipeline.js";
import { collectPluginContextProviders } from "@/host/plugins.js";
import type { AgentrailPlugin, ContextProvider } from "@/host/types.js";
import type { TransformContextFn } from "@agentrail/core";

interface ResolveTransformContextOptions {
  getTransformContext?: (context: {
    tenantId: string;
    userId: string;
    sessionId: string;
  }) => Promise<TransformContextFn> | TransformContextFn;
  baseTransformContext?: Promise<TransformContextFn | undefined> | TransformContextFn | undefined;
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
  const transforms: TransformContextFn[] = [];
  if (options.getTransformContext) {
    transforms.push(await options.getTransformContext(context));
  }
  if (options.baseTransformContext) {
    const baseTransform = await options.baseTransformContext;
    if (baseTransform) {
      transforms.push(baseTransform);
    }
  }

  const mergedTransform = transforms.length > 0 ? composeTransformContexts(transforms) : undefined;

  return createTransformContext(
    collectPluginContextProviders(
      plugins,
      options.getContextProviders
        ? await options.getContextProviders(context)
        : (options.contextProviders ?? []),
    ),
    context,
    mergedTransform,
  );
}
