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
  AgentrailResolvedStreamContext,
  AgentrailStreamRouteOptions,
} from "@/routes/stream-route.js";

export { createOrchestrationRegistry } from "@/host/orchestration-registry.js";
export type { CreateSessionManagedAgent } from "@/host/orchestration-registry.js";

export type {
  CompactionConfig,
  CompactionSummaryContext,
  ReactiveCompactionConfig,
  SummarizeMessagesFn,
} from "@/host/compaction.js";
export {
  composeTransformContexts,
  createContextProviderFromTransform,
  createTransformContext,
} from "@/host/context-pipeline.js";

export { runPluginLifecycle } from "@/host/plugins.js";

/** @deprecated Use `createStaticProfileResolver` from `@agentrail/app` instead. */
export { createProfileResolver } from "@/host/profile-registry.js";

export { createFilesystemInspectorDataSource } from "@/inspector/data-source.js";
export type { InspectorDataSource } from "@/inspector/data-source.js";
export { createInspectorRoute } from "@/inspector/index.js";
