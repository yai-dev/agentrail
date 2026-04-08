/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 *
 * Low-level host primitives for advanced use-cases and escape hatches.
 *
 * Import from `@agentrail/app/advanced` when you need direct control over
 * chat/stream routes, orchestration wiring, or context-pipeline transforms.
 * Most applications should use `createAgentApp` from `@agentrail/app` instead.
 */

export { createChatRoute } from "@/routes/chat-route.js";
export type { AgentrailChatRouteOptions } from "@/routes/chat-route.js";

export { createStreamRoute } from "@/routes/stream-route.js";
export type {
  AgentrailStreamRouteOptions,
  AgentrailResolvedStreamContext,
} from "@/routes/stream-route.js";

export { createOrchestrationRegistry } from "@/host/orchestration-registry.js";
export type { CreateSessionManagedAgent } from "@/host/orchestration-registry.js";

export { createTransformContext, createContextProviderFromTransform } from "@/host/context-pipeline.js";
export type { CompactionConfig } from "@/host/compaction.js";

export { runPluginLifecycle } from "@/host/plugins.js";

/** @deprecated Use `createStaticProfileResolver` from `@agentrail/app` instead. */
export { createProfileResolver } from "@/host/profile-registry.js";
