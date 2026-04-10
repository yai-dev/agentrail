/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// ============================================================================
// Primary API — start here
// ============================================================================

/** Define an agent profile (static or dynamic). */
export { defineProfile } from "@/profile/define-profile.js";
export type {
  DynamicAgentResult,
  DynamicProfileShape,
  ProfileDefinition,
  StaticProfileShape,
} from "@/profile/define-profile.js";

/** Create a fully configured Hono app with `/chat` and `/stream` endpoints. */
export { createAgentApp } from "@/app/create-agent-app.js";
export type { CreateAgentAppOptions } from "@/app/create-agent-app.js";
export type {
  CompactionSummaryContext,
  ReactiveCompactionConfig,
  SummarizeMessagesFn,
} from "@/host/compaction.js";

/** Build a static profile resolver backed by a fixed list of profiles. */
export { createStaticProfileResolver } from "@/host/profile-registry.js";
export type { ProfileResolver } from "@/host/profile-registry.js";

// ============================================================================
// Session management
// ============================================================================

export { compactToolResults } from "@/session/compaction.js";
export {
  SessionManager,
  isCompactionMessage,
  parseCompactionMetadata,
} from "@/session/session-manager.js";
export { createFileSystemSessionTraceStore } from "@/session/trace-store.js";

// ============================================================================
// Host runtime types (shared across chat and stream routes)
// ============================================================================

export type {
  AgentrailChatHandledResponse,
  AgentrailChatRequest,
  AgentrailChatRequestContext,
  AgentrailChatSuccessBody,
  AgentrailPlugin,
  AgentrailProfile,
  AgentrailProfileContext,
  AgentrailRequestLifecycleContext,
  AgentrailResolvedChatContext,
  AgentrailSessionStore,
  AttachmentFile,
  AttachmentHandler,
  AttachmentHandlerResult,
  ContextProvider,
  ContextProviderContext,
  PluginErrorContext,
  PluginErrorHandler,
} from "@/host/types.js";

// ============================================================================
// Plugins
// ============================================================================

export { runPluginLifecycle } from "@/host/plugins.js";

export {
  UserMemoryConsolidationService,
  createUserMemoryPlugin,
} from "@/plugins/user-memory/index.js";
export type { UserMemoryConfig } from "@/plugins/user-memory/index.js";

// ============================================================================
// Events
// ============================================================================

export { mapOrchestrationEvent } from "@/events/index.js";
export type {
  AgentrailContextCompactionEndEvent,
  AgentrailContextCompactionStartEvent,
  AgentrailEvent,
  WorkflowTraceEventEnvelope,
} from "@/events/index.js";

// ============================================================================
// Health
// ============================================================================

export type { ReadinessCheck, ReadinessCheckResult, ReadinessResponse } from "@/health/index.js";

// ============================================================================
// Telemetry
// ============================================================================

export { createConsoleTelemetrySink, createFileTelemetrySink } from "@/telemetry/sink.js";
export type { TelemetrySink, TelemetrySinkEvent } from "@/telemetry/sink.js";

// ============================================================================
// Config
// ============================================================================

export {
  DEFAULT_CONFIG_RELATIVE_PATH,
  DEFAULT_DATA_DIR,
  getDeepResearchConfig,
  getPlaygroundServerConfig,
  getPlaygroundUiConfig,
  loadAgentrailConfig,
  parseAgentrailConfig,
  resolveAgentrailConfigPath,
} from "@/config/index.js";
export type { AgentrailConfig } from "@/config/index.js";

// ============================================================================
// Slash commands
// ============================================================================

export * from "@/commands/index.js";
