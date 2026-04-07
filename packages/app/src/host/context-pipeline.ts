/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Message, TransformContextFn } from "@agentrail/core";
import type { ContextProvider, ContextProviderContext } from "./types.js";

/** Composes multiple context providers into a single transform function. */
export function createTransformContext(
  providers: ContextProvider[],
  context: ContextProviderContext,
): TransformContextFn {
  return async (messages) => {
    const injected: Message[] = [];

    for (const provider of providers) {
      const provided = await provider(context, messages);
      if (provided.length > 0) {
        injected.push(...provided);
      }
    }

    return [...injected, ...messages];
  };
}

/** Adapts a transform-context function back into the `ContextProvider` interface. */
export function createContextProviderFromTransform(transform: TransformContextFn): ContextProvider {
  return async (_context, messages) => {
    const transformed = await transform(messages);
    return transformed.slice(0, Math.max(0, transformed.length - messages.length));
  };
}
