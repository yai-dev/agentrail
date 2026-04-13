/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { runCapabilityCompatibilityChecks } from "@/compat/capability-check.js";
import type { WorkflowTraceEventEnvelope } from "@/events/index.js";
import type { ReadinessCheck } from "@/health/index.js";
import { createHealthRoute } from "@/health/index.js";
import {
  createOrchestrationRegistry,
  type AgentrailOrchestrationRegistry,
} from "@/host/orchestration-registry.js";
import type { ProfileResolver } from "@/host/profile-registry.js";
import { createStaticProfileResolver } from "@/host/profile-registry.js";
import type { ReactiveCompactionConfig, SummarizeMessagesFn } from "@/host/reactive-compaction.js";
import type { AgentrailPlugin, ContextProvider, PluginErrorHandler } from "@/host/types.js";
import {
  createFilesystemInspectorDataSource,
  type InspectorDataSource,
} from "@/inspector/data-source.js";
import { createInspectorRoute } from "@/inspector/index.js";
import type { ProfileDefinition } from "@/profile/define-profile.js";
import { createChatRoute } from "@/routes/chat-route.js";
import { createStreamRoute } from "@/routes/stream-route.js";
import { SessionManager } from "@/session/session-manager.js";
import { createFileSystemSessionTraceStore } from "@/session/trace-store.js";
import type { TelemetrySink } from "@/telemetry/sink.js";
import type { SandboxManager, ToolPermissionPolicy } from "@agentrail/capabilities";
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
   * Factory that creates a session-scoped trace store for each request.
   *
   * When omitted and `dataDir` is provided, `createAgentApp` falls back to
   * the default filesystem-backed `createFileSystemSessionTraceStore`.
   * Provide this option to redirect workflow traces to a custom backend
   * (e.g. a database or a remote tracing service).
   *
   * @example
   * ```ts
   * import { createFileSystemSessionTraceStore } from "@agentrail/app";
   * createAgentApp({
   *   traceStoreFactory: (sessionRef) =>
   *     createFileSystemSessionTraceStore(dataDir, sessionRef),
   * });
   * ```
   */
  traceStoreFactory?: (
    sessionRef: import("@agentrail/core").SessionRef,
  ) => import("@/session/trace-store.js").SessionTraceStore<
    import("@/events/index.js").WorkflowTraceEventEnvelope
  >;
  /**
   * Sandbox manager for upload handling and workspace snapshots in the stream route.
   * When omitted the `/stream` endpoint is still available but file-upload and
   * workspace-snapshot features are disabled.
   */
  sandboxManager?: SandboxManager;
  /**
   * Factory that creates an `OrchestrationPersistence` for each session.
   *
   * When provided alongside `orchestrationRegistry`, the registry is expected to
   * use the same factory — this option is a convenience shortcut for callers
   * building a registry via `createOrchestrationRegistry({ createPersistence })`.
   *
   * When omitted and `dataDir` is provided, the default filesystem persistence
   * is used.
   *
   * @see {@link https://agentrail.run/reference/host-primitives}
   */
  createOrchestrationPersistence?: (
    sessionRef: import("@agentrail/core").SessionRef,
  ) => import("@agentrail/capabilities").OrchestrationPersistence;
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
   * Enable the Inspector API at `/__inspector`.
   *
   * Three variants:
   * - `true` — automatically creates a filesystem data source from `dataDir`.
   *   Requires `dataDir` to be set; throws at startup if `dataDir` is absent.
   * - `InspectorDataSource` — use a custom data source (e.g. a PostgreSQL backend).
   * - `Record<string, never>` — legacy no-op alias for `true`.
   *
   * The mount path is fixed at `/__inspector` to stay in sync with the
   * Agentrail Inspector Docker image, whose nginx proxy hardcodes that prefix.
   *
   * @example
   * ```ts
   * // Filesystem backend (default)
   * createAgentApp({ dataDir: "./data", profiles: [...], inspector: true });
   *
   * // Custom backend
   * import { createFilesystemInspectorDataSource } from "@agentrail/app";
   * createAgentApp({ inspector: createFilesystemInspectorDataSource("./data"), ... });
   * ```
   *
   * @see {@link https://agentrail.run/reference/inspector-route}
   */
  inspector?:
    | true
    | import("@/inspector/data-source.js").InspectorDataSource
    | Record<string, never>;
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
  /**
   * Optional permission policy applied to all sessions served by this app.
   *
   * When set, tools evaluate the policy via their `checkPermissions` hook
   * before executing.  The policy is forwarded through the `profileCtx` into
   * `CapabilityBuildContext.permissionPolicy`.
   *
   * Individual routes (`createStreamRoute`, `createChatRoute`) expose the same
   * option when using the lower-level primitives directly.
   */
  permissionPolicy?: ToolPermissionPolicy;
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
    onPluginError,
    telemetrySink,
    health: healthOptions,
    inspector: inspectorOptions,
    permissionPolicy,
  } = options;

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

  // Resolve the orchestration registry:
  //   1. Explicit registry passed by the host — use as-is.
  //   2. createOrchestrationPersistence factory provided — auto-build a registry with it.
  //   3. Neither provided — no orchestration; stream route won't forward SSE events.
  //
  // Intentionally NOT auto-creating a registry from dataDir alone: the registry
  // will throw when stream-route calls getOrchestrationManager() without a prior
  // orchestration() capability registration (no createManagedAgent factory).
  // This would silently break non-orchestration streaming requests.
  const orchestrationRegistry: AgentrailOrchestrationRegistry | undefined = (() => {
    if (options.orchestrationRegistry) return options.orchestrationRegistry;
    if (options.createOrchestrationPersistence) {
      return createOrchestrationRegistry({
        createPersistence: options.createOrchestrationPersistence,
      });
    }
    return undefined;
  })();

  // Build a per-session trace-store handler for persisting trace envelopes.
  // Precedence: explicit traceStoreFactory > dataDir filesystem fallback > none.
  const traceStoreHandler:
    | ((
        ctx: { tenantId: string; sessionId: string; sessionRef: SessionRef },
        envelope: WorkflowTraceEventEnvelope,
      ) => void)
    | undefined = (() => {
    const factory = options.traceStoreFactory;
    if (factory) {
      // Cache trace stores by sessionRef to avoid re-creating on every event.
      const cache = new Map<SessionRef, ReturnType<typeof factory>>();
      return (
        ctx: { tenantId: string; sessionId: string; sessionRef: SessionRef },
        envelope: WorkflowTraceEventEnvelope,
      ) => {
        let store = cache.get(ctx.sessionRef);
        if (!store) {
          store = factory(ctx.sessionRef);
          cache.set(ctx.sessionRef, store);
        }
        void store.appendEnvelope(envelope).catch(() => {});
      };
    }
    if (dataDir) {
      return (
        _ctx: { tenantId: string; sessionId: string; sessionRef: SessionRef },
        envelope: WorkflowTraceEventEnvelope,
      ) => {
        // Note: createFileSystemSessionTraceStore lazily opens the file, so
        // creating a new instance per call is safe and avoids reference leaks.
        const store = createFileSystemSessionTraceStore<WorkflowTraceEventEnvelope>(
          dataDir,
          _ctx.sessionRef,
        );
        void store.appendEnvelope(envelope).catch(() => {});
      };
    }
    return undefined;
  })();

  /**
   * Adapts a TelemetrySink into the `onTraceEvent` callback shape expected by
   * both chat-route and stream-route. Fire-and-forget; errors from the sink are
   * swallowed so they never break the request pipeline.
   *
   * Also writes to the trace store (traceStoreHandler) when one is configured.
   */
  const makeSinkTraceHandler =
    traceStoreHandler || telemetrySink
      ? (
          ctx: { tenantId: string; sessionId: string; sessionRef: SessionRef },
          envelope: WorkflowTraceEventEnvelope,
        ): void => {
          traceStoreHandler?.(ctx, envelope);
          if (telemetrySink) {
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
        }
      : undefined;

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
    ...(permissionPolicy ? { permissionPolicy } : {}),
  };

  // ── Capability compatibility checks ───────────────────────────────────────
  runCapabilityCompatibilityChecks(profiles, Boolean(sandboxManager));

  // ── Inspector validation ───────────────────────────────────────────────────
  let resolvedInspectorDataSource: InspectorDataSource | null = null;
  if (inspectorOptions) {
    const isExplicitDataSource =
      typeof inspectorOptions === "object" && "listSessions" in inspectorOptions;

    if (isExplicitDataSource) {
      // Explicit InspectorDataSource — always allowed.
      resolvedInspectorDataSource = inspectorOptions as InspectorDataSource;
    } else {
      // `true` or legacy `{}` → filesystem mode; requires dataDir and no custom sessionStore.
      if (!dataDir) {
        throw new Error(
          "createAgentApp: `inspector: true` requires `dataDir` to be set. " +
            "For custom storage backends, pass an `InspectorDataSource` object instead.",
        );
      }
      if (options.sessionStore) {
        throw new Error(
          "createAgentApp: `inspector: true` is incompatible with a custom `sessionStore`. " +
            "The built-in Inspector reads directly from the filesystem layout produced by " +
            "SessionManager. Either remove `sessionStore` from your options, or pass an " +
            "explicit `InspectorDataSource` as `inspector: <dataSource>`.",
        );
      }
      resolvedInspectorDataSource = createFilesystemInspectorDataSource(dataDir);
    }
  }

  const app = new Hono();

  // ── Health routes ──────────────────────────────────────────────────────────
  if (!healthOptions?.disableBuiltinHealthRoutes) {
    app.route("/", createHealthRoute(sessionStore, healthOptions?.readinessChecks ?? []));
  }

  // ── Inspector API ──────────────────────────────────────────────────────────
  if (resolvedInspectorDataSource) {
    app.route("/__inspector", createInspectorRoute(resolvedInspectorDataSource));
  }

  app.route("/chat", createChatRoute(chatRouteOptions));

  // Always mount /stream. sandboxManager is optional — when absent, file-upload
  // and workspace-snapshot features are simply not available.
  //
  // dataDir is forwarded only for attachment/upload support; trace store
  // persistence is handled through the combined onTraceEvent handler above.
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
