/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 *
 * Compatibility layer for code written against the pre-Proposal-106 API surface.
 *
 * Import from `@agentrail/app/compat` when migrating from `@agentrail/host/defaults`
 * or `@agentrail/host`. These exports are retained for backward compatibility only
 * and may be removed in a future major version.
 *
 */

/** @deprecated Use `defineProfile()` from `@agentrail/app` instead. */
export { createHostedProfileResolver, defineHostedProfile } from "@/host/defaults/profile.js";
export type { HostedProfileDefinition } from "@/host/defaults/shared-types.js";

/** @deprecated Capability wiring is handled automatically by `defineProfile()`. */
export {
  createDefaultCapabilityContextProviders,
  createDefaultCapabilityTransformContext,
} from "@/host/defaults/capability-context.js";
export {
  makeDateContextMessage,
  makeKnowledgeContextMessage,
  makeMemoryIndexMessage,
  makeSkillsContextMessage,
  makeUserIdentityMessage,
  translateMemoryPaths,
} from "@/host/defaults/capability-messages.js";
export { buildDefaultCapabilityTools } from "@/host/defaults/capability-tools.js";
export type {
  DefaultCapabilityContextOptions,
  DefaultCapabilityToolOptions,
  DefaultCapabilityTools,
  DefaultContextProvidersInput,
  DefaultToolsetInput,
} from "@/host/defaults/shared-types.js";
export { createDefaultContextProviders, createDefaultToolset } from "@/host/defaults/toolset.js";
