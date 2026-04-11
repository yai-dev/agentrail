/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { runCapabilityCompatibilityChecks } from "@/compat/capability-check.js";
import type { WorkflowTraceEventEnvelope } from "@/events/index.js";
import type { ReadinessCheck } from "@/health/index.js";
import { createHealthRoute } from "@/health/index.js";
import type { AgentrailOrchestrationRegistry } from "@/host/orchestration-registry.js";
import type { ProfileResolver } from "@/host/profile-registry.js";
import { createStaticProfileResolver } from "@/host/profile-registry.js";
import type { ReactiveCompactionConfig, SummarizeMessagesFn } from "@/host/reactive-compaction.js";
import type { AgentrailPlugin, ContextProvider, PluginErrorHandler } from "@/host/types.js";
import { createInspectorRoute } from "@/inspector/index.js";
import type { ProfileDefinition } from "@/profile/define-profile.js";
import { createChatRoute } from "@/routes/chat-route.js";
import { createStreamRoute } from "@/routes/stream-route.js";
import { SessionManager } from "@/session/session-manager.js";
import type { TelemetrySink } from "@/telemetry/sink.js";
import type { SandboxManager } from "@agentrail/capabilities";
import type { AgentrailSessionStore, Message, SessionRef } from "@agentrail/core";
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
  summarize?: SummarizeMessagesFn;
  /**
   * Compaction trigger thresholds.
   * Defaults to `{ triggerTokens: 150_000, minMessages: 20 }`.
   */
  compaction?: {
    triggerTokens: number;
    minMessages: number;
    reactive?: ReactiveCompactionConfig;
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
  /**
   * Set to `true` to mount the Inspector API at `/__inspector`.
   *
   * When enabled, `createAgentApp` exposes a read-only HTTP API that the
   * Agentrail Inspector Docker image consumes to display sessions, traces, and
   * orchestration data.
   *
   * **Requires** `dataDir` — a custom `sessionStore` is not supported. An error
   * is thrown at startup when this invariant is violated.
   *
   * The mount path is fixed at `/__inspector` in v1 to stay in sync with the
   * Inspector Docker image, whose nginx proxy hardcodes that prefix.
   *
   * @example
   * ```ts
   * createAgentApp({ dataDir: "./data", profiles: [...], inspector: true });
   * ```
   *
   * @see {@link https://agentrail.run/reference/inspector-route}
   */
  inspector?: true | Record<string, never>;
  /**
   * Health route configuration.
   *
   * When not disabled, `createAgentApp` automatically mounts:
   * - `GET /health` — liveness probe (always 200 while the process is alive)
   * - `GET /ready`  — readiness probe; runs built-in session store check plus
   *   any `readinessChecks` provided here. Returns 503 if any check fails.
   *
   * The response format is compatible with Kubernetes liveness/readiness probes.
   */
  health?: {
    /**
     * Additional readiness checks run alongside the built-in session store check.
     * Use this to verify provider API keys or other external dependencies.
     */
    readinessChecks?: ReadinessCheck[];
    /**
     * Set to `true` to skip mounting `/health` and `/ready` entirely.
     * Useful when the host application manages health routes itself.
     */
    disableBuiltinHealthRoutes?: boolean;
  };
  /**
   * Telemetry sink that receives structured events from both the `/chat` and
   * `/stream` routes.
   *
   * Built-in sinks: `createConsoleTelemetrySink()` (development) and
   * `createFileTelemetrySink(dataDir)` (production, writes JSONL trace files).
   *
   * Note: events emitted via `/chat` are coarser than `/stream` — only
   * synthetic `agent_start`, `agent_end`, and `error` events are produced,
   * because `agent.invoke()` does not expose granular turn/tool events.
   *
   * @see {@link https://agentrail.run/reference/telemetry-sink}
   */
  telemetrySink?: TelemetrySink;
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
    compaction = {
      triggerTokens: 150_000,
      minMessages: 20,
      reactive: {
        enabled: true,
        microTriggerPct: 85,
        fullTriggerPct: 92,
        preserveRecentApiRounds: 2,
        microBatchGroups: 2,
        maxReactiveCompactionsPerRequest: 3,
      },
    },
    plugins = [],
    contextProviders = [],
    sandboxManager,
    orchestrationRegistry,
    onPluginError,
    telemetrySink,
    health: healthOptions,
    inspector: inspectorOptions,
  } = options;

  /**
   * Adapts a TelemetrySink into the `onTraceEvent` callback shape expected by
   * both chat-route and stream-route. Fire-and-forget; errors from the sink are
   * swallowed so they never break the request pipeline.
   */
  const makeSinkTraceHandler = telemetrySink
    ? (
        ctx: { tenantId: string; sessionId: string; sessionRef: SessionRef },
        envelope: WorkflowTraceEventEnvelope,
      ): void => {
        const sinkEvent = {
          // envelope.traceId is now always set by wrapTraceEvent() callers; the
          // fallback to envelope.id is retained only for external envelopes
          // constructed without the traceId argument.
          traceId: envelope.traceId ?? envelope.id,
          sessionId: ctx.sessionId,
          tenantId: ctx.tenantId,
          timestamp: envelope.timestamp,
          sequence: envelope.sequence,
          source: envelope.source as "runtime" | "orchestration" | "host",
          event: envelope.event,
        };
        void Promise.resolve(telemetrySink.emit(sinkEvent)).catch(() => {
          // sink errors must not surface to callers
        });
      }
    : undefined;

  // Per-request flush called at the end of every chat/stream request so that
  // sinks with internal write buffers (e.g. custom batch sinks) never
  // accumulate unbounded state between requests.
  const onRequestEnd = telemetrySink?.flush
    ? async () => {
        await telemetrySink.flush!().catch(() => {});
      }
    : undefined;

  if (profiles.length === 0 && !customResolver) {
    throw new Error("createAgentApp: at least one of `profiles` or `resolveProfile` is required.");
  }

  // Resolve the session store: prefer explicit override, fall back to filesystem.
  const sessionStore: AgentrailSessionStore = (() => {
    if (options.sessionStore) return options.sessionStore;
    if (!dataDir) {
      throw new Error("createAgentApp: `dataDir` is required when `sessionStore` is not provided.");
    }
    return new SessionManager(dataDir);
  })();

  const defaultAgentId = explicitDefaultAgentId ?? profiles[0]?.id;
  if (!defaultAgentId) {
    throw new Error("createAgentApp: `defaultAgentId` is required when `profiles` is empty.");
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
    ...(makeSinkTraceHandler ? { onTraceEvent: makeSinkTraceHandler } : {}),
    ...(onRequestEnd ? { onRequestEnd } : {}),
  };

  // ── Capability compatibility checks ───────────────────────────────────────
  runCapabilityCompatibilityChecks(profiles, Boolean(sandboxManager));

  // ── Inspector validation ───────────────────────────────────────────────────
  if (inspectorOptions) {
    if (!dataDir) {
      throw new Error(
        "createAgentApp: `inspector` requires `dataDir` to be set. " +
          "Custom sessionStore implementations are not supported by the built-in Inspector API.",
      );
    }
    if (options.sessionStore) {
      throw new Error(
        "createAgentApp: `inspector` is incompatible with a custom `sessionStore`. " +
          "The Inspector API reads directly from the filesystem layout produced by the default " +
          "SessionManager. Remove `sessionStore` from your options, or disable `inspector`.",
      );
    }
  }

  const app = new Hono();

  // ── Health routes ──────────────────────────────────────────────────────────
  if (!healthOptions?.disableBuiltinHealthRoutes) {
    app.route("/", createHealthRoute(sessionStore, healthOptions?.readinessChecks ?? []));
  }

  // ── Inspector API ──────────────────────────────────────────────────────────
  if (inspectorOptions && dataDir) {
    app.route("/__inspector", createInspectorRoute(dataDir));
  }

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
