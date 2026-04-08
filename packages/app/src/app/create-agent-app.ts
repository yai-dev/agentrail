/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Message } from "@agentrail/core";
import type { AgentrailSessionStore } from "@agentrail/core";
import type { SandboxManager } from "@agentrail/capabilities";
import type { AgentrailPlugin, ContextProvider, PluginErrorHandler } from "@/host/types.js";
import type { AgentrailOrchestrationRegistry } from "@/host/orchestration-registry.js";
import type { ProfileDefinition } from "@/profile/define-profile.js";
import type { ProfileResolver } from "@/host/profile-registry.js";
import { SessionManager } from "@/session/session-manager.js";
import { createChatRoute } from "@/routes/chat-route.js";
import { createStreamRoute } from "@/routes/stream-route.js";
import { createStaticProfileResolver } from "@/host/profile-registry.js";
import { Hono } from "hono";

/**
 * Top-level options for `createAgentApp()`.
 *
 * @see {@link https://agentrail.run/reference/create-agent-app}
 */
export interface CreateAgentAppOptions {
  /**
   * Directory used for persistent session storage.
   * Required when `sessionStore` is not provided.
   */
  dataDir?: string;
  /**
   * Custom session store implementation.
   * When provided, `dataDir` is ignored for session storage.
   * Use this to swap in a database-backed or in-memory store.
   */
  sessionStore?: AgentrailSessionStore;
  /**
   * Profiles available to the app.
   * The first profile is used as the default when requests omit `agentId`.
   *
   * At least one of `profiles` or `resolveProfile` must be provided.
   */
  profiles?: ProfileDefinition[];
  /**
   * Custom profile resolver for dynamic routing (tenant-aware, mode-aware, etc.).
   * When provided, `profiles` is only used as a fallback for `defaultAgentId`.
   *
   * At least one of `profiles` or `resolveProfile` must be provided.
   */
  resolveProfile?: ProfileResolver;
  /**
   * Default profile ID used when requests omit `agentId`.
   * Falls back to the first entry in `profiles` when not set.
   */
  defaultAgentId?: string;
  /**
   * Optional summarizer for context-window compaction.
   *
   * When omitted a no-op fallback is used that simply concatenates message
   * content. This means compaction will technically run but the replacement
   * placeholder will **not** contain a meaningful summary — the agent may
   * lose context rather than receiving a condensed recap. For production use
   * always provide a real summarizer backed by an LLM call.
   */
  summarize?: (messages: Message[]) => Promise<string>;
  /**
   * Compaction trigger thresholds.
   * Defaults to `{ triggerTokens: 150_000, minMessages: 20 }`.
   */
  compaction?: {
    triggerTokens: number;
    minMessages: number;
  };
  /**
   * App-level plugins for request interception and lifecycle hooks.
   */
  plugins?: AgentrailPlugin[];
  /**
   * Called whenever a plugin hook throws an isolated error.
   * Defaults to `console.warn`. May be async.
   *
   * Pass the same handler to `runPluginLifecycle()` if you call it manually so
   * that lifecycle errors share the same reporting path as request-time errors.
   *
   * @see {@link PluginErrorHandler}
   */
  onPluginError?: PluginErrorHandler;
  /**
   * Static context providers prepended to every request.
   */
  contextProviders?: ContextProvider[];
  /**
   * Sandbox manager for upload handling and workspace snapshots in the stream route.
   * When omitted the `/stream` endpoint is still available but file-upload and
   * workspace-snapshot features are disabled.
   */
  sandboxManager?: SandboxManager;
  /**
   * Orchestration registry used by the stream route to subscribe to sub-agent
   * events for real-time SSE forwarding.
   *
   * Pass the same registry instance you used in `orchestration(registry, factory)`
   * so the stream route can subscribe to events from already-initialized managers.
   *
   * When omitted, orchestration SSE events are not forwarded to the client.
   */
  orchestrationRegistry?: AgentrailOrchestrationRegistry;
}

/**
 * Creates a fully configured Hono application with chat and stream endpoints.
 *
 * **Minimal usage with a static profile list:**
 * ```ts
 * const app = createAgentApp({
 *   dataDir: "./data",
 *   profiles: [myProfile],
 *   summarize: async (messages) => summarizer(messages),
 * });
 * ```
 *
 * **Custom session store (e.g. database-backed):**
 * ```ts
 * const app = createAgentApp({
 *   sessionStore: myDatabaseSessionStore,
 *   profiles: [myProfile],
 * });
 * ```
 *
 * **Dynamic profile routing (tenant-aware, feature-flag-aware, etc.):**
 * ```ts
 * const app = createAgentApp({
 *   dataDir: "./data",
 *   resolveProfile: async ({ agentId, tenantId }) => {
 *     return await loadProfileForTenant(agentId, tenantId);
 *   },
 *   defaultAgentId: "default",
 * });
 * ```
 *
 * @see {@link https://agentrail.run/reference/create-agent-app}
 */
export function createAgentApp(options: CreateAgentAppOptions): Hono {
  const {
    dataDir,
    profiles = [],
    resolveProfile: customResolver,
    defaultAgentId: explicitDefaultAgentId,
    summarize,
    compaction = { triggerTokens: 150_000, minMessages: 20 },
    plugins = [],
    contextProviders = [],
    sandboxManager,
    orchestrationRegistry,
    onPluginError,
  } = options;

  if (profiles.length === 0 && !customResolver) {
    throw new Error(
      "createAgentApp: at least one of `profiles` or `resolveProfile` is required.",
    );
  }

  // Resolve the session store: prefer explicit override, fall back to filesystem.
  const sessionStore: AgentrailSessionStore = (() => {
    if (options.sessionStore) return options.sessionStore;
    if (!dataDir) {
      throw new Error(
        "createAgentApp: `dataDir` is required when `sessionStore` is not provided.",
      );
    }
    return new SessionManager(dataDir);
  })();

  const defaultAgentId = explicitDefaultAgentId ?? profiles[0]?.id;
  if (!defaultAgentId) {
    throw new Error(
      "createAgentApp: `defaultAgentId` is required when `profiles` is empty.",
    );
  }

  // Build the static resolver from the profiles array (used when no custom resolver given).
  const staticResolver = profiles.length ? createStaticProfileResolver(profiles) : null;

  // Adapt the public ProfileResolver shape to the route's 3-argument signature.
  const resolveProfile = customResolver
    ? async (
        agentId: string,
        context: {
          tenantId: string;
          userId: string;
          sessionId: string;
          sessionRef: import("@agentrail/core").SessionRef;
          sessionStore: AgentrailSessionStore;
        },
        _onSubAgentEvent?: (event: object) => void,
      ) => {
        return customResolver({
          agentId,
          tenantId: context.tenantId,
          userId: context.userId,
          sessionId: context.sessionId,
          sessionRef: context.sessionRef,
          sessionStore: context.sessionStore,
        });
      }
    : staticResolver!;

  // Fallback summarizer: produces a raw transcript. Not suitable for production
  // — provide a real LLM-backed summarizer via the `summarize` option instead.
  const noop = async (messages: Message[]) => {
    return messages.map((m) => ("content" in m ? String(m.content) : "")).join("\n");
  };
  const summarizeFn = summarize ?? noop;

  const chatRouteOptions = {
    defaultAgentId,
    sessionStore,
    summarize: summarizeFn,
    compaction,
    resolveProfile,
    plugins,
    contextProviders,
    ...(onPluginError ? { onPluginError } : {}),
  };

  const app = new Hono();
  app.route("/chat", createChatRoute(chatRouteOptions));

  // Always mount /stream. sandboxManager is optional — when absent, file-upload
  // and workspace-snapshot features are simply not available.
  const streamRouteOptions = {
    ...chatRouteOptions,
    ...(dataDir ? { dataDir } : {}),
    ...(sandboxManager ? { sandboxManager } : {}),
    ...(orchestrationRegistry
      ? {
          getOrchestrationManager: (ctx: {
            tenantId: string;
            userId: string;
            sessionId: string;
            sessionRef: import("@agentrail/core").SessionRef;
          }) =>
            orchestrationRegistry.getManager({
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              sessionId: ctx.sessionId,
              sessionRef: ctx.sessionRef,
            }),
        }
      : {}),
  };
  app.route("/stream", createStreamRoute(streamRouteOptions));

  return app;
}
