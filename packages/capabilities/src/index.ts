/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// ============================================================================
// Capability descriptor types — the core contracts for the capability system
// ============================================================================

export type { CapabilityBuildContext, CapabilityDescriptor } from "@/types.js";

// ============================================================================
// Capability factory functions — the public API for composing capabilities
// ============================================================================

/** Sandboxed filesystem tools: bash, read, write, edit, glob, grep, sleep, todo-write */
export { filesystem } from "@/filesystem/index.js";
export type { FilesystemOptions } from "@/filesystem/index.js";

/** Browser automation tools: navigate, scroll, action, content */
export { browser } from "@/browser/index.js";
export type { BrowserOptions } from "@/browser/index.js";

/** Knowledge-base tools: kb-list, kb-read, kb-search */
export { knowledge } from "@/knowledge/descriptor.js";

/** Skills registry tool */
export { skills } from "@/skills/descriptor.js";
export type { SkillsOptions } from "@/skills/descriptor.js";

/** Sub-agent orchestration tools: spawn-agent, send-input, wait-agent, close-agent */
export { orchestration } from "@/orchestration/descriptor.js";
export type { OrchestrationOptions } from "@/orchestration/descriptor.js";

/** Persistent to-do list tool backed by the session store */
export { todo } from "@/todo/descriptor.js";

/** Pause-and-ask-user tool backed by a WaitHandleRegistry */
export { askUser } from "@/ask-user/descriptor.js";

/** Context provider that injects memory, identity, date, knowledge, and skills context */
export { memoryContext } from "@/memory/index.js";
export type { MemoryContextOptions } from "@/memory/index.js";

// ============================================================================
// Context pipeline utilities
// ============================================================================

export {
  composeTransformContexts,
  createContextProviderFromTransform,
  createTransformContext,
} from "@/context-pipeline.js";

// ============================================================================
// SandboxManager — for advanced sandbox management
// ============================================================================

export { SANDBOX_IMAGE, SandboxManager } from "@/sandbox/index.js";
export type {
  BackgroundExecResult,
  ExecResult,
  RunOptions,
  SandboxEntry,
  SandboxManagerOptions,
} from "@/sandbox/index.js";

export {
  createBrowserAction,
  createBrowserContent,
  createBrowserNavigate,
  createBrowserScroll,
  createSandboxedBash,
  createSandboxedEdit,
  createSandboxedGlob,
  createSandboxedGrep,
  createSandboxedPython,
  createSandboxedRead,
  createSandboxedWrite,
} from "@/sandbox/index.js";

// ============================================================================
// KnowledgeManager
// ============================================================================

export { KnowledgeManager } from "@/knowledge/index.js";
export type {
  IngestionEvent,
  IngestionJob,
  IngestionStep,
  KBDocMeta,
  KBMetadata,
  KnowledgeIndex,
  SearchResult,
  Taxonomy,
} from "@/knowledge/index.js";

export { createKbListTool, createKbReadTool, createKbSearchTool } from "@/knowledge/index.js";

// ============================================================================
// SkillManager
// ============================================================================

export { SkillManager } from "@/skills/index.js";
export type {
  ExtendedSseEvent,
  SkillConfig,
  SkillEndEvent,
  SkillMeta,
  SkillStartEvent,
} from "@/skills/index.js";

export { buildSkillTool } from "@/skills/index.js";

// ============================================================================
// OrchestrationManager
// ============================================================================

export {
  OrchestrationManager,
  createFilesystemOrchestrationPersistence,
} from "@/orchestration/index.js";
export type {
  AgentInputEnvelope,
  CreateManagedAgentInput,
  ManagedAgentDeliveryResult,
  ManagedAgentInstance,
  OrchestrationAgent,
  OrchestrationEvent,
  OrchestrationMailboxState,
  OrchestrationPersistence,
  StartRunInput,
  SubAgentRuntime,
  SubagentWorkerConfig,
  WorkerState,
} from "@/orchestration/index.js";

export { createSubAgentProcess } from "@/orchestration/index.js";

export {
  createCloseAgentTool,
  createSendInputTool,
  createSpawnAgentTool,
  createWaitAgentTool,
} from "@/orchestration/tools/index.js";

// ============================================================================
// Individual tools (advanced / standalone use)
// ============================================================================

export {
  bashTool,
  createAskUserQuestionTool,
  createBraveSearchProvider,
  createGlobTool,
  createJinaSearchProvider,
  createSleepTool,
  createTavilySearchProvider,
  createTodoWriteTool,
  createWebFetchTool,
  createWebSearchTool,
  editTool,
  grepTool,
  readTool,
  writeTool,
} from "@/tools/index.js";
export type {
  BraveSearchProviderOptions,
  JinaSearchProviderOptions,
  SleepToolOptions,
  TavilySearchProviderOptions,
  WaitHandleRegistry,
  WebFetchDetails,
  WebFetchExtractionClient,
  WebFetchExtractionRequest,
  WebFetchExtractionResponse,
  WebFetchStatus,
  WebFetchToolOptions,
  WebSearchOptions,
  WebSearchProvider,
  WebSearchResult,
  WebSearchToolOptions,
} from "@/tools/index.js";

// ============================================================================
// Memory context utilities (advanced)
// ============================================================================

export {
  createDefaultCapabilityContextProviders,
  createDefaultCapabilityTransformContext,
} from "@/memory/context.js";
export type { DefaultCapabilityContextOptions } from "@/memory/types.js";
