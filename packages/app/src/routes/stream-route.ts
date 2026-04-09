/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { randomUUID } from "node:crypto";
import {
  mapOrchestrationEvent,
  TRACE_PERSISTED_EVENT_TYPES,
  wrapTraceEvent,
  type AgentrailContextUsageEvent,
  type AgentrailErrorEvent,
  type WorkflowTraceEventEnvelope,
} from "@/events/index.js";
import type { SessionRef } from "@agentrail/core";
import type { OrchestrationManager } from "@agentrail/capabilities";
import type { Agent, Message, RuntimeEvent, TransformContextFn, Usage } from "@agentrail/core";
import { isRuntimeError } from "@agentrail/core";
import type { SandboxManager } from "@agentrail/capabilities";
import { Hono } from "hono";
import { streamText } from "hono/streaming";
import { runPluginRequestHook } from "@/host/plugins.js";
import { runCompactionStep } from "@/routes/compaction-runner.js";
import { awaitSandboxWarmup } from "@/routes/sandbox-warmup.js";
import { persistUploadedFiles, buildEffectiveMessage } from "@/routes/attachment-pipeline.js";
import { createSseEventWriter } from "@/routes/sse-writer.js";
import { resolveTransformContext } from "@/routes/context-resolver.js";
import { validateStreamRequest, type StreamRequest } from "@/routes/stream-request.js";
import type {
  AgentrailPlugin,
  AgentrailProfile,
  AgentrailProfileContext,
  AgentrailRequestLifecycleContext,
  AgentrailSessionStore,
  AttachmentFile,
  AttachmentHandler,
  ContextProvider,
  PluginErrorHandler,
} from "@/host/types.js";

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Configuration for the streaming SSE chat route factory.
 *
 * @see {@link https://agentrail.run/reference/host-primitives}
 */
export interface AgentrailStreamRouteOptions {
  /**
   * Root data directory used for persisting uploaded attachments.
   * Required only when the `/stream` endpoint receives requests with file attachments.
   * When absent, attachment uploads throw a clear error; all other streaming features work normally.
   */
  dataDir?: string;
  /** Default profile ID used when the request omits `agentId`. */
  defaultAgentId: string;
  /** Session store implementation used for history persistence and compaction. */
  sessionStore: AgentrailSessionStore;
  /**
   * Sandbox manager used to persist uploads and prepare isolated execution.
   * Optional — when absent the `/stream` route works without file-upload or
   * sandbox-snapshot support but all other streaming features are available.
   */
  sandboxManager?: SandboxManager;
  /** Resolves a hosted profile for the given request context. */
  resolveProfile(
    agentId: string,
    context: {
      tenantId: string;
      userId: string;
      sessionId: string;
      sessionRef: SessionRef;
      sessionStore: AgentrailSessionStore;
    },
    onSubAgentEvent?: (event: object) => void,
  ): Promise<AgentrailProfile | null>;
  /** Summarizer used when streaming history needs compaction. */
  summarize(messages: Message[]): Promise<string>;
  /** Token thresholds that decide when to compact history. */
  compaction: {
    triggerTokens: number;
    minMessages: number;
  };
  /** Optional plugins that can observe lifecycle events. */
  plugins?: AgentrailPlugin[];
  /** Static context providers prepended before conversation history. */
  contextProviders?: ContextProvider[];
  /** Dynamic context-provider resolver invoked per request. */
  getContextProviders?: (context: {
    tenantId: string;
    userId: string;
    sessionId: string;
  }) => Promise<ContextProvider[]> | ContextProvider[];
  /** Dynamic transform-context resolver invoked per request. */
  getTransformContext?: (context: {
    tenantId: string;
    userId: string;
    sessionId: string;
  }) => Promise<TransformContextFn> | TransformContextFn;
  /** Optional attachment handler that turns uploaded files into extra context. */
  attachmentHandler?: AttachmentHandler;
  /** Optional callback invoked once request processing begins. */
  onRequestStart?: (context: AgentrailRequestLifecycleContext) => void | Promise<void>;
  /** Optional callback invoked when request processing ends. */
  onRequestEnd?: (context: AgentrailRequestLifecycleContext) => void | Promise<void>;
  /** Optional callback invoked after the turn has been persisted. */
  onTurnPersisted?: (context: AgentrailRequestLifecycleContext) => void | Promise<void>;
  /**
   * Called whenever a plugin hook throws an isolated error.
   * Defaults to `console.warn`. May be async.
   * @see {@link PluginErrorHandler}
   */
  onPluginError?: PluginErrorHandler;
  /** Connects this route to an orchestration manager for multi-agent event forwarding. */
  getOrchestrationManager?: (context: {
    tenantId: string;
    userId: string;
    sessionId: string;
    sessionRef: SessionRef;
  }) => Promise<OrchestrationManager>;
  /** Optional hook that can fully handle a resolved stream request. */
  handleResolvedRequest?: (context: AgentrailResolvedStreamContext) => Promise<boolean> | boolean;
  /**
   * Optional observer called after each SSE event is written, for events whose
   * type is in TRACE_PERSISTED_EVENT_TYPES. Fire-and-forget; must not throw.
   * Intended for trace persistence in application layers (e.g. playground-server).
   */
  onTraceEvent?: (
    context: { tenantId: string; sessionId: string; sessionRef: SessionRef },
    envelope: WorkflowTraceEventEnvelope,
  ) => void;
}

/** Fully resolved stream request context exposed to custom handlers. */
export interface AgentrailResolvedStreamContext {
  request: StreamRequest;
  agentId: string;
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionRef: SessionRef;
  signal: AbortSignal;
  sessionStore: AgentrailSessionStore;
  uploadedFiles: AttachmentFile[];
  writeEvent: (event: object) => Promise<void>;
  persistTurn: (messages: Message[], usage: Usage) => Promise<void>;
}

// ─── Route factory ────────────────────────────────────────────────────────────

/**
 * Creates the hosted streaming route that emits SSE-style newline-delimited events.
 *
 * @see {@link https://agentrail.run/guides/consume-stream}
 * @see {@link https://agentrail.run/reference/host-primitives}
 */
export function createStreamRoute(options: AgentrailStreamRouteOptions): Hono {
  const plugins = options.plugins ?? [];
  const onPluginError = options.onPluginError;
  const route = new Hono();

  route.post("/", async (c) => {
    // ── 1. Parse & validate ──────────────────────────────────────────────────
    let body: StreamRequest;
    try {
      body = await c.req.json<StreamRequest>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const validation = validateStreamRequest(body);
    if (!validation.valid) return c.json({ error: validation.error }, 400);

    const { message, agentId = options.defaultAgentId, tenantId, userId, sessionId, attachments } =
      body;

    // ── 2. Session init ──────────────────────────────────────────────────────
    const sessionInfo = await options.sessionStore.getOrCreate(tenantId, userId, agentId, sessionId);
    const sid = sessionInfo.sessionId;
    const sessionRef = sessionInfo.sessionRef;
    const requestContext: AgentrailRequestLifecycleContext = {
      kind: "stream",
      tenantId,
      userId,
      sessionId: sid,
      agentId,
    };

    // ── 3. Process attachments ───────────────────────────────────────────────
    const uploadedFiles = await persistUploadedFiles(options.dataDir, sid, attachments);
    const effectiveMessage = await buildEffectiveMessage(
      message,
      uploadedFiles,
      plugins,
      options.attachmentHandler,
      onPluginError,
    );

    // ── 4. Lifecycle hooks + sandbox warmup (fire-and-forget) ────────────────
    await options.onRequestStart?.(requestContext);
    await runPluginRequestHook(plugins, "onRequestStart", requestContext, onPluginError);
    const sandboxReady = options.sandboxManager?.ensureSandbox(sid, tenantId, userId);

    // ── 5. Pre-resolve profile (skipped when a custom handler is registered) ─
    let forwardSubAgentEvent: (event: object) => void = () => {};
    let preloadedProfile: AgentrailProfile | null | undefined;
    if (!options.handleResolvedRequest) {
      preloadedProfile = await options.resolveProfile(
        agentId,
        { tenantId, userId, sessionId: sid, sessionRef, sessionStore: options.sessionStore },
        (event) => forwardSubAgentEvent(event),
      );
      if (!preloadedProfile) return c.json({ error: `Agent profile '${agentId}' not found` }, 404);
    }

    c.header("X-Session-Id", sid);

    const abortController = new AbortController();
    c.req.raw.signal.addEventListener("abort", () => abortController.abort());

    // ── 6. Open SSE stream ───────────────────────────────────────────────────
    return streamText(c, async (textStream) => {
      const { writeEvent, forwardSubAgentEvent: forwardEvent } = createSseEventWriter(textStream);
      forwardSubAgentEvent = forwardEvent;

      let unsubscribeOrchestration: (() => void) | undefined;
      let traceSeq = 0;
      // One stable ID shared by all envelopes emitted for this HTTP request.
      const requestTraceId = randomUUID();

      const maybeTraceEvent = (event: object) => {
        if (!options.onTraceEvent) return;
        const type = (event as { type?: string }).type;
        if (!type || !TRACE_PERSISTED_EVENT_TYPES.has(type)) return;
        const envelope = wrapTraceEvent(
          "runtime",
          event as Record<string, unknown>,
          traceSeq++,
          requestTraceId,
        );
        try {
          options.onTraceEvent({ tenantId, sessionId: sid, sessionRef }, envelope);
        } catch {
          // observer must not break the stream
        }
      };

      // Used by handleResolvedRequest custom handlers — semantics unchanged.
      const persistTurn = async (messages: Message[], usage: Usage) => {
        await Promise.all([
          options.sessionStore.appendMessages(tenantId, sid, messages),
          options.sessionStore.recordTurn(tenantId, sid, usage),
        ]);
        await options.onTurnPersisted?.(requestContext);
        await runPluginRequestHook(plugins, "onTurnPersisted", requestContext, onPluginError);
      };

      // Standard streaming path: messages already persisted incrementally per turn.complete;
      // this finalizer only records usage and fires lifecycle hooks.
      const finalizeUsage = async (usage: Usage) => {
        await options.sessionStore.recordTurn(tenantId, sid, usage);
        await options.onTurnPersisted?.(requestContext);
        await runPluginRequestHook(plugins, "onTurnPersisted", requestContext, onPluginError);
      };

      try {
        // ── 6a. Await sandbox ──────────────────────────────────────────────
        const sandboxOk = await awaitSandboxWarmup(sandboxReady, (e) => {
          maybeTraceEvent(e);
          return writeEvent(e);
        });
        if (!sandboxOk) return;

        // ── 6b. Custom short-circuit ───────────────────────────────────────
        if (options.handleResolvedRequest) {
          const handled = await options.handleResolvedRequest({
            request: { ...body, message: effectiveMessage, agentId, sessionId: sid },
            agentId,
            tenantId,
            userId,
            sessionId: sid,
            sessionRef,
            signal: abortController.signal,
            sessionStore: options.sessionStore,
            uploadedFiles,
            writeEvent,
            persistTurn,
          });
          if (handled) return;
        }

        // ── 6c. Resolve profile ────────────────────────────────────────────
        const profile =
          preloadedProfile ??
          (await options.resolveProfile(
            agentId,
            { tenantId, userId, sessionId: sid, sessionRef, sessionStore: options.sessionStore },
            (event) => forwardSubAgentEvent(event),
          ));
        if (!profile) {
          const errorEvent: AgentrailErrorEvent = {
            type: "error",
            error: { message: `Agent profile '${agentId}' not found` },
          };
          await writeEvent(errorEvent);
          return;
        }

        const profileCtx: AgentrailProfileContext = {
          tenantId,
          userId,
          sessionId: sid,
          sessionRef,
          sessionStore: options.sessionStore,
        };

        // ── 6d. Compact history + load budget slice ────────────────────────
        const workspaceSnapshot = await options.sandboxManager
          ?.listWorkspace(sid)
          .catch(() => undefined);
        const history = await runCompactionStep(
          options.sessionStore,
          tenantId,
          sid,
          options.summarize,
          options.compaction,
          {
            workspaceSnapshot,
            onBeforeCompact: async () => {
              await writeEvent({ type: "context_compaction_start" });
              maybeTraceEvent({ type: "context_compaction_start" });
            },
            onAfterCompact: async () => {
              await writeEvent({ type: "context_compaction_end" });
              maybeTraceEvent({ type: "context_compaction_end" });
            },
          },
        );

        // ── 6e. Build agent + context ──────────────────────────────────────
        // NOTE: createAgent() must be called before subscribing to orchestration
        // events because capabilities (e.g. orchestration()) register their
        // createManagedAgent factory into the registry during agent creation.
        // Subscribing first would cause getManager() to fail for new sessions.
        const agent = await profile.createAgent(profileCtx, (event) =>
          forwardSubAgentEvent(event),
        );
        const capProviders = (await profile.getContextProviders?.(profileCtx)) ?? [];
        const transformContext = await resolveTransformContext(
          { ...options, contextProviders: [...(options.contextProviders ?? []), ...capProviders] },
          plugins,
          { tenantId, userId, sessionId: sid },
        );

        // ── 6f. Subscribe to orchestration events ──────────────────────────
        // Must happen after createAgent() so the orchestration() capability
        // has already registered its factory with the registry.
        if (options.getOrchestrationManager) {
          const manager = await options.getOrchestrationManager({
            tenantId,
            userId,
            sessionId: sid,
            sessionRef,
          });
          unsubscribeOrchestration = manager.subscribe(({ event }) => {
            const mapped = mapOrchestrationEvent(event);
            if (mapped) void writeEvent(mapped);
          });
        }

        // ── 6g. Stream agent events ────────────────────────────────────────
        const { usage: capturedUsage, persistenceOk } = await drainAgentStream(
          agent,
          effectiveMessage,
          {
            messages: history,
            signal: abortController.signal,
            transformContext,
            contextWindow: profile.contextWindow,
            writeEvent,
            onTraceEvent: maybeTraceEvent,
            onTurnMessagesReady: async (msgs) => {
              await options.sessionStore.appendMessages(tenantId, sid, msgs);
            },
          },
        );

        if (capturedUsage) {
          if (persistenceOk) {
            // All per-turn flushes succeeded — record usage and fire lifecycle hooks.
            await finalizeUsage(capturedUsage);
          } else {
            // At least one per-turn flush failed; the conversation state on disk is
            // incomplete. Record usage for billing/rate-limiting but skip
            // onTurnPersisted so plugins do not observe a partial write as durable.
            await options.sessionStore.recordTurn(tenantId, sid, capturedUsage);
          }
        }
      } finally {
        unsubscribeOrchestration?.();
        await options.onRequestEnd?.(requestContext);
        await runPluginRequestHook(plugins, "onRequestEnd", requestContext, onPluginError);
      }
    });
  });

  return route;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface DrainAgentStreamOptions {
  messages: Message[];
  signal: AbortSignal;
  transformContext: TransformContextFn;
  contextWindow?: number;
  writeEvent: (event: RuntimeEvent | object) => Promise<void>;
  onTraceEvent: (event: RuntimeEvent | object) => void;
  /**
   * Called after each internal reasoning turn (turn.complete) with the batch of new messages
   * produced during that turn. SSE is written first; this runs immediately after.
   * Errors are swallowed — a failed flush permanently drops that batch (no retry).
   */
  onTurnMessagesReady?: (messages: Message[]) => Promise<void>;
}

/**
 * Iterates the agent stream, writes each event to SSE, and returns the captured usage.
 * `persistenceOk` is false if any per-turn `onTurnMessagesReady` flush threw an error;
 * callers must not fire `onTurnPersisted` in that case.
 */
async function drainAgentStream(
  agent: Agent,
  message: string,
  opts: DrainAgentStreamOptions,
): Promise<{ usage: Usage | null; persistenceOk: boolean }> {
  let capturedUsage: Usage | null = null;
  let persistenceOk = true;

  // Accumulate messages via message.end; flush atomically on each turn.complete.
  const pendingPersistMessages: Message[] = [];
  let persistedCount = 0;

  const agentStream = agent.stream(message, {
    messages: opts.messages,
    signal: opts.signal,
    transformContext: opts.transformContext,
  });

  for await (const event of agentStream) {
    if (isRuntimeError(event)) {
      const errorEvent: AgentrailErrorEvent = {
        type: "error",
        error: { message: (event.error as Error)?.message ?? "Unknown runtime error" },
      };
      await opts.writeEvent(errorEvent);
      opts.onTraceEvent(errorEvent);
      break;
    }

    // Accumulate fully-assembled messages for incremental persistence.
    if (event.type === "message.end") {
      pendingPersistMessages.push(event.message);
    }

    // SSE-first: write to client before persisting.
    await opts.writeEvent(event);
    opts.onTraceEvent(event);

    // After each internal reasoning turn, flush the accumulated batch atomically.
    // persistedCount advances before the flush attempt so a failure permanently
    // drops the batch rather than risking duplicate writes on the next turn.
    if (event.type === "turn.complete" && opts.onTurnMessagesReady) {
      const batch = pendingPersistMessages.slice(persistedCount);
      persistedCount = pendingPersistMessages.length;
      if (batch.length > 0) {
        try {
          await opts.onTurnMessagesReady(batch);
        } catch {
          // Persist failure is non-fatal; stream continues unaffected.
          // Mark the flag so the caller can skip onTurnPersisted — the conversation
          // state on disk is now incomplete.
          persistenceOk = false;
        }
      }
    }

    if (event.type === "session.end") {
      capturedUsage = event.usage;

      const totalInputTokens =
        (event.usage.inputTokens ?? 0) +
        (event.usage.cacheReadTokens ?? 0) +
        (event.usage.cacheWriteTokens ?? 0);
      const usageEvent: AgentrailContextUsageEvent = {
        type: "context_usage",
        inputTokens: totalInputTokens,
        outputTokens: event.usage.outputTokens ?? 0,
        budgetUsedPct: Math.round((totalInputTokens / (opts.contextWindow ?? 200_000)) * 100),
      };
      await opts.writeEvent(usageEvent);
      break;
    }

    // Abort check is at the bottom of the loop so that an event already dequeued
    // from the EventStream (including a turn.complete) is fully processed before
    // we stop. Events still in the queue are not guaranteed.
    if (opts.signal.aborted) break;
  }

  return { usage: capturedUsage, persistenceOk };
}
