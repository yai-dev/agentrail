/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { CapabilityBuildContext, CapabilityDescriptor } from "../types.js";
import { buildSkillTool } from "./skill-tools.js";
import type { SkillManager } from "./skill-manager.js";

export interface SkillsOptions {
  /**
   * Controls how skill invocations run:
   * - `"delegate"` — spawns a managed sub-agent (default, recommended)
   * - `"inline"` — runs the skill tool directly inside the main agent
   */
  mode?: "inline" | "delegate";
  /** Override container path where skill definitions are mounted. */
  containerSkillsDir?: string;
}

/**
 * Capability that gives the agent access to a skills registry.
 * Skills are pre-defined task templates the agent can dispatch.
 *
 * @param manager – The SkillManager holding available skills.
 * @see {@link https://agentrail.run/capabilities/skills}
 */
export function skills(manager: SkillManager, opts?: SkillsOptions): CapabilityDescriptor {
  const delegateSkillsToSubAgent = opts?.mode !== "inline";
  const containerSkillsDir = opts?.containerSkillsDir ?? "/skills";

  return {
    type: "skills",

    async buildTools(ctx: CapabilityBuildContext) {
      const sm = ctx.skillManager ?? manager;
      const delegate = ctx.delegateSkillsToSubAgent ?? delegateSkillsToSubAgent;
      const { modelConfig, onSubAgentEvent, sessionRef, sessionStore } = ctx;

      if (!modelConfig) {
        return [];
      }

      const skillTool = await buildSkillTool(
        sm,
        modelConfig,
        [],
        onSubAgentEvent,
        delegate,
        containerSkillsDir,
        (entry) => sessionStore.persistSkillSubAgentLog?.(sessionRef, entry),
        { tenantId: ctx.tenantId, userId: ctx.userId },
      );

      return skillTool ? [skillTool] : [];
    },
  };
}
