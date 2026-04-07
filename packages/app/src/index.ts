/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// ============================================================================
// Primary API — start here
// ============================================================================

/** Define an agent profile (static or dynamic). */
export { defineProfile } from "./profile/define-profile.js";
export type {
  DynamicProfileShape,
  ProfileDefinition,
  StaticProfileShape,
} from "./profile/define-profile.js";

/** Create a fully configured Hono app with `/chat` and `/stream` endpoints. */
export { createAgentApp } from "./app/create-agent-app.js";
export type { CreateAgentAppOptions } from "./app/create-agent-app.js";

// ============================================================================
// Session management
// ============================================================================

export { SessionManager } from "./session/session-manager.js";
export {
  isCompactionMessage,
  parseCompactionMetadata,
} from "./session/session-manager.js";
export { compactToolResults } from "./session/compaction.js";
export { createFileSystemSessionTraceStore } from "./session/trace-store.js";

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
  AgentrailResolvedChatContext,
  AgentrailRequestLifecycleContext,
  AgentrailSessionStore,
  AttachmentFile,
  AttachmentHandler,
  AttachmentHandlerResult,
  ContextProvider,
  ContextProviderContext,
} from "./host/types.js";

// ============================================================================
// Low-level host primitives (advanced / escape-hatch path)
// ============================================================================

/** Low-level JSON chat route factory. */
export { createChatRoute } from "./routes/chat-route.js";
export type { AgentrailChatRouteOptions } from "./routes/chat-route.js";

/** Low-level SSE streaming route factory. */
export { createStreamRoute } from "./routes/stream-route.js";
export type {
  AgentrailStreamRouteOptions,
  AgentrailResolvedStreamContext,
} from "./routes/stream-route.js";

export { createProfileResolver } from "./host/profile-registry.js";
export { createOrchestrationRegistry } from "./host/orchestration-registry.js";
export type { CreateSessionManagedAgent } from "./host/orchestration-registry.js";
export { createTransformContext, createContextProviderFromTransform } from "./host/context-pipeline.js";
export type { CompactionConfig } from "./host/compaction.js";

// ============================================================================
// Plugin lifecycle
// ============================================================================

export { runPluginLifecycle } from "./host/plugins.js";

// ============================================================================
// Default hosted profile helpers (advanced)
// ============================================================================

export { defineHostedProfile, createHostedProfileResolver } from "./host/defaults/profile.js";
export type { HostedProfileDefinition } from "./host/defaults/shared-types.js";
export { buildDefaultCapabilityTools } from "./host/defaults/capability-tools.js";
export {
  createDefaultCapabilityContextProviders,
  createDefaultCapabilityTransformContext,
} from "./host/defaults/capability-context.js";
export { createDefaultContextProviders, createDefaultToolset } from "./host/defaults/toolset.js";
export type {
  DefaultCapabilityContextOptions,
  DefaultCapabilityToolOptions,
  DefaultCapabilityTools,
  DefaultContextProvidersInput,
  DefaultToolsetInput,
} from "./host/defaults/shared-types.js";
export {
  makeDateContextMessage,
  makeKnowledgeContextMessage,
  makeMemoryIndexMessage,
  makeSkillsContextMessage,
  makeUserIdentityMessage,
  translateMemoryPaths,
} from "./host/defaults/capability-messages.js";

// ============================================================================
// Plugins
// ============================================================================

export { createUserMemoryPlugin } from "./plugins/user-memory/index.js";
export {
  UserMemoryConsolidationService,
} from "./plugins/user-memory/index.js";
export type { UserMemoryConfig } from "./plugins/user-memory/index.js";

// ============================================================================
// Events
// ============================================================================

export type {
  AgentrailContextCompactionEndEvent,
  AgentrailContextCompactionStartEvent,
  AgentrailEvent,
  WorkflowTraceEventEnvelope,
} from "./events/index.js";
export { mapOrchestrationEvent } from "./events/index.js";

// ============================================================================
// Config
// ============================================================================

export {
  loadAgentrailConfig,
  parseAgentrailConfig,
  resolveAgentrailConfigPath,
  getPlaygroundServerConfig,
  getDeepResearchConfig,
  getPlaygroundUiConfig,
  DEFAULT_CONFIG_RELATIVE_PATH,
  DEFAULT_DATA_DIR,
} from "./config/index.js";
export type { AgentrailConfig } from "./config/index.js";

// ============================================================================
// Slash commands
// ============================================================================

export * from "./commands/index.js";
