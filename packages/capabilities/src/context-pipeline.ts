/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Message, TransformContextFn } from "@agentrail/core";
import type { ContextProvider, ContextProviderContext } from "@agentrail/core";

/** Composes multiple transform functions into a single left-to-right pipeline. */
export function composeTransformContexts(
  transforms: Array<TransformContextFn | null | undefined>,
): TransformContextFn {
  const activeTransforms = transforms.filter((t): t is TransformContextFn => Boolean(t));
  return async (messages, signal) => {
    let current = messages;
    for (const transform of activeTransforms) {
      current = await transform(current, signal);
    }
    return current;
  };
}

/** Composes multiple context providers into a single transform function. */
export function createTransformContext(
  providers: ContextProvider[],
  context: ContextProviderContext,
  baseTransform?: TransformContextFn,
): TransformContextFn {
  return async (messages, signal) => {
    const rewrittenMessages = baseTransform ? await baseTransform(messages, signal) : messages;
    const injected: Message[] = [];

    for (const provider of providers) {
      const provided = await provider(context, rewrittenMessages);
      if (provided.length > 0) {
        injected.push(...provided);
      }
    }

    return [...injected, ...rewrittenMessages];
  };
}

/** Adapts a transform-context function back into the `ContextProvider` interface. */
export function createContextProviderFromTransform(transform: TransformContextFn): ContextProvider {
  return async (_context, messages) => {
    const transformed = await transform(messages);
    return transformed.slice(0, Math.max(0, transformed.length - messages.length));
  };
}
