/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  AgentrailChatHandledResponse,
  AgentrailChatRequestContext,
  AgentrailPlugin,
  AgentrailProfileContext,
  AgentrailRequestLifecycleContext,
  AttachmentFile,
  AttachmentHandler,
  AttachmentHandlerResult,
  ContextProvider,
  PluginErrorContext,
  PluginErrorHandler,
} from "@/host/types.js";
import type {
  ToolInterceptor,
  ToolInterceptorAfterContext,
  ToolInterceptorBeforeContext,
} from "@agentrail/core";

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
async function safeNotify(onError: PluginErrorHandler, ctx: PluginErrorContext): Promise<void> {
  try {
    await onError(ctx);
  } catch (notifyErr) {
    console.error(
      `[agentrail] onPluginError threw while reporting "${ctx.plugin}" / ${ctx.hook}:`,
      notifyErr,
    );
  }
}

/**
 * Returns true when `value` is a plain, non-array object.
 *
 * Used by `buildToolInterceptor` to guard the object-spread copy that is
 * applied before each plugin hook call.  The app-layer `BeforeToolCallEvent`
 * and `AfterToolCallEvent` contracts expose `input` as `Record<string, unknown>`,
 * so hooks are only meaningful for object-shaped tool parameters.  For arrays,
 * primitives, or `null`, the composed interceptor skips all plugin hooks rather
 * than corrupting the value with an object spread.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
 * Builds a `ToolInterceptor` that composes `onBeforeToolCall` and
 * `onAfterToolCall` hooks from all registered plugins, in descending priority
 * order (same ordering used for all other plugin hooks).
 *
 * Returns `undefined` when no plugin implements either hook so that the caller
 * can skip interceptor overhead entirely.
 *
 * ### Error isolation
 * - **`onBeforeToolCall`**: if a plugin hook throws, the error is reported via
 *   `safeNotify(onError, ...)` and execution continues with the next plugin
 *   (the throw is **not** treated as a deny). Only an explicit
 *   `{ action: "deny" }` return blocks tool execution.
 * - **`onAfterToolCall`**: each plugin hook is individually try/caught; errors
 *   are reported via `safeNotify` and do not affect the tool result.
 */
export function buildToolInterceptor(
  plugins: AgentrailPlugin[],
  profileContext: AgentrailProfileContext,
  onError: PluginErrorHandler = defaultErrorHandler,
): ToolInterceptor | undefined {
  const ordered = sortByPriority(plugins);
  const beforePlugins = ordered.filter((p) => p.onBeforeToolCall != null);
  const afterPlugins = ordered.filter((p) => p.onAfterToolCall != null);

  if (beforePlugins.length === 0 && afterPlugins.length === 0) {
    return undefined;
  }

  const interceptor: ToolInterceptor = {};

  if (beforePlugins.length > 0) {
    interceptor.onBeforeToolCall = async (ctx: ToolInterceptorBeforeContext) => {
      // App-layer plugin hooks only support object-shaped tool parameters.
      // Skip all hooks for arrays, primitives, and null so the value is never
      // corrupted by an object spread.
      if (!isPlainObject(ctx.input)) {
        return { action: "allow" };
      }

      let currentInput: Record<string, unknown> = ctx.input;

      for (const plugin of beforePlugins) {
        try {
          const result = await plugin.onBeforeToolCall!({
            toolName: ctx.toolName,
            // Fresh shallow copy per plugin so that in-place mutations by one
            // plugin do not silently affect subsequent plugins.  Explicit
            // `{ action: "allow", input }` is the declared API for passing
            // modifications forward.
            input: { ...currentInput },
            context: profileContext,
          });

          if (result.action === "deny") {
            return result;
          }

          if (result.action === "allow" && "input" in result) {
            currentInput = result.input;
          }
        } catch (err) {
          await safeNotify(onError, {
            plugin: plugin.name,
            hook: "onBeforeToolCall",
            error: err,
          });
          // A throw is NOT a deny — continue to the next plugin.
        }
      }

      return currentInput !== (ctx.input as Record<string, unknown>)
        ? { action: "allow", input: currentInput }
        : { action: "allow" };
    };
  }

  if (afterPlugins.length > 0) {
    interceptor.onAfterToolCall = async (ctx: ToolInterceptorAfterContext) => {
      // Same guard as onBeforeToolCall — skip for non-object inputs.
      if (!isPlainObject(ctx.input)) {
        return;
      }

      const baseInput: Record<string, unknown> = ctx.input;

      for (const plugin of afterPlugins) {
        try {
          await plugin.onAfterToolCall!({
            toolName: ctx.toolName,
            // Fresh shallow copy per plugin, consistent with onBeforeToolCall.
            input: { ...baseInput },
            result: ctx.result,
            durationMs: ctx.durationMs,
            context: profileContext,
          });
        } catch (err) {
          await safeNotify(onError, {
            plugin: plugin.name,
            hook: "onAfterToolCall",
            error: err,
          });
        }
      }
    };
  }

  return interceptor;
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
