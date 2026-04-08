/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { CapabilityBuildContext, CapabilityDescriptor } from "@/types.js";
import { createTodoWriteTool } from "@/tools/index.js";

/**
 * Capability that gives the agent a persistent to-do list for tracking tasks
 * across turns.
 *
 * The tool is backed by the session store's `createTodoStorage()` method.
 * When the session store does not implement `createTodoStorage`, the capability
 * silently contributes no tools rather than throwing, so it is safe to include
 * in profiles that may run against minimal session stores.
 *
 * ```ts
 * const profile = defineProfile({
 *   capabilities: [todo()],
 * });
 * ```
 *
 * @see {@link https://agentrail.run/capabilities/todo}
 */
export function todo(): CapabilityDescriptor {
  return {
    type: "todo",

    async buildTools(ctx: CapabilityBuildContext) {
      const todoStorage = ctx.sessionStore.createTodoStorage?.(ctx.sessionRef);
      return todoStorage ? [createTodoWriteTool(todoStorage)] : [];
    },
  };
}
