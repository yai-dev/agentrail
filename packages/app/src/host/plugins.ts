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
  PluginErrorContext,
  PluginErrorHandler,
} from "@/host/types.js";

// ============================================================================
// Internal helpers
// ============================================================================

const defaultErrorHandler: PluginErrorHandler = ({ plugin, hook, error }) => {
  console.warn(`[agentrail] Plugin "${plugin}" threw in ${hook}:`, error);
};

/**
 * Calls `onError` and swallows any error the callback itself throws,
 * falling back to `console.error`. This ensures the callback can never
 * interfere with the main request flow.
 */
async function safeNotify(
  onError: PluginErrorHandler,
  ctx: PluginErrorContext,
): Promise<void> {
  try {
    await onError(ctx);
  } catch (notifyErr) {
    console.error(
      `[agentrail] onPluginError threw while reporting "${ctx.plugin}" / ${ctx.hook}:`,
      notifyErr,
    );
  }
}

/** Returns a new array sorted by descending priority (higher runs first). */
function sortByPriority(plugins: AgentrailPlugin[]): AgentrailPlugin[] {
  return [...plugins].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/**
 * Returns a new array sorted by ascending priority (lower priority first).
 * Used for `stop()` so teardown order is the reverse of startup order.
 */
function sortByPriorityReverse(plugins: AgentrailPlugin[]): AgentrailPlugin[] {
  return [...plugins].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
}

// ============================================================================
// Public API
// ============================================================================

/** Collects static context providers exposed by installed plugins, in priority order. */
export function collectPluginContextProviders(
  plugins: AgentrailPlugin[],
  baseProviders: ContextProvider[] = [],
): ContextProvider[] {
  return [
    ...baseProviders,
    ...sortByPriority(plugins).flatMap((plugin) => plugin.contextProviders ?? []),
  ];
}

/**
 * Runs the `start` or `stop` lifecycle phase for all plugins.
 *
 * - **`start`**: plugins run in descending priority order. If a plugin throws,
 *   `onError` is notified and the error propagates (startup is aborted).
 * - **`stop`**: plugins run in ascending priority order (reverse of start) so
 *   teardown mirrors initialisation. Errors are isolated — all plugins always
 *   get a chance to stop.
 */
export async function runPluginLifecycle(
  plugins: AgentrailPlugin[],
  phase: "start" | "stop",
  onError: PluginErrorHandler = defaultErrorHandler,
): Promise<void> {
  const ordered = phase === "stop" ? sortByPriorityReverse(plugins) : sortByPriority(plugins);

  for (const plugin of ordered) {
    try {
      await plugin[phase]?.();
    } catch (err) {
      await safeNotify(onError, { plugin: plugin.name, hook: phase, error: err });
      if (phase === "start") {
        throw err;
      }
      // stop: continue so every plugin gets a chance to clean up
    }
  }
}

/**
 * Runs a request lifecycle hook (`onRequestStart`, `onRequestEnd`,
 * `onTurnPersisted`) for all plugins in priority order.
 *
 * Errors are isolated per plugin: `onError` is called and execution continues.
 */
export async function runPluginRequestHook(
  plugins: AgentrailPlugin[],
  hook: "onRequestStart" | "onRequestEnd" | "onTurnPersisted",
  context: AgentrailRequestLifecycleContext,
  onError: PluginErrorHandler = defaultErrorHandler,
): Promise<void> {
  for (const plugin of sortByPriority(plugins)) {
    try {
      await plugin[hook]?.(context);
    } catch (err) {
      await safeNotify(onError, { plugin: plugin.name, hook, error: err });
    }
  }
}

/**
 * Runs `interceptChatRequest` on each plugin in priority order, stopping at
 * the first non-null response.
 *
 * - **Non-critical plugins**: errors are isolated — `onError` is called and
 *   the plugin is skipped (treated as returning `null`).
 * - **Critical plugins** (`plugin.critical === true`): `onError` is called
 *   first, then the error propagates so the request is aborted. Use this for
 *   auth or policy plugins where a throw means "deny".
 */
export async function runPluginChatRequestInterceptors(
  plugins: AgentrailPlugin[],
  context: AgentrailChatRequestContext,
  onError: PluginErrorHandler = defaultErrorHandler,
): Promise<AgentrailChatHandledResponse | null> {
  for (const plugin of sortByPriority(plugins)) {
    try {
      const result = await plugin.interceptChatRequest?.(context);
      if (result) {
        return result;
      }
    } catch (err) {
      await safeNotify(onError, { plugin: plugin.name, hook: "interceptChatRequest", error: err });
      if (plugin.critical) {
        throw err;
      }
    }
  }

  return null;
}

/**
 * Runs attachment handlers from all plugins and the optional fallback, merging
 * all returned `contextText` values.
 *
 * Errors from individual handlers are isolated: `onError` is called and that
 * plugin's result is skipped; other handlers still run.
 */
export async function runAttachmentHandlers(
  files: AttachmentFile[],
  plugins: AgentrailPlugin[],
  fallbackHandler?: AttachmentHandler,
  onError: PluginErrorHandler = defaultErrorHandler,
): Promise<AttachmentHandlerResult | null> {
  const results: AttachmentHandlerResult[] = [];

  for (const plugin of sortByPriority(plugins)) {
    if (!plugin.attachmentHandler) {
      continue;
    }

    try {
      const result = await plugin.attachmentHandler(files);
      if (result?.contextText) {
        results.push(result);
      }
    } catch (err) {
      await safeNotify(onError, { plugin: plugin.name, hook: "attachmentHandler", error: err });
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
