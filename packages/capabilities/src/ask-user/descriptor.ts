/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { CapabilityBuildContext, CapabilityDescriptor } from "@/types.js";
import { createAskUserQuestionTool, type WaitHandleRegistry } from "@/tools/index.js";

/**
 * Capability that lets the agent pause and ask the user a clarifying question
 * mid-turn, waiting for a response before continuing.
 *
 * Accepts a process-level `WaitHandleRegistry` that manages pending questions.
 * The registry is captured in the closure at profile-definition time, following
 * the same pattern as `knowledge(km)` and `skills(sm)`.
 *
 * ```ts
 * import { askUser } from "@agentrail/capabilities";
 *
 * const waitRegistry = createWaitHandleRegistry();
 *
 * const profile = defineProfile({
 *   capabilities: [askUser(waitRegistry)],
 * });
 * ```
 *
 * @param registry – The process-level registry that holds pending wait handles.
 * @see {@link https://agentrail.run/capabilities/ask-user}
 */
export function askUser(registry: WaitHandleRegistry): CapabilityDescriptor {
  return {
    type: "ask-user",

    async buildTools(ctx: CapabilityBuildContext) {
      const reg = ctx.waitHandleRegistry ?? registry;
      return [createAskUserQuestionTool(ctx.sessionId, reg)];
    },
  };
}
