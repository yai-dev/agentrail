/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SkillManager } from "@/skills/skill-manager.js";
import { buildSkillTool } from "@/skills/skill-tools.js";
import type { CapabilityBuildContext, CapabilityDescriptor } from "@/types.js";

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
      const delegate = delegateSkillsToSubAgent;
      const { modelConfig, onSubAgentEvent, sessionRef, sessionStore } = ctx;

      if (!modelConfig) {
        throw new Error(
          "[agentrail] skills() requires modelConfig at build time.\n" +
            "  • Static profile: modelConfig is derived automatically from agent.model — no extra step needed.\n" +
            "  • Dynamic profile: return { agent, modelConfig } from createAgent() instead of a bare Agent:\n" +
            "      async createAgent(ctx) {\n" +
            "        return {\n" +
            "          agent: defineAgent({ model: 'anthropic:claude-sonnet-4-5', ... }),\n" +
            "          modelConfig: { provider: 'anthropic', modelId: 'claude-sonnet-4-5' },\n" +
            "        };\n" +
            "      }\n" +
            "  (Legacy fallback: a top-level modelConfig on the defineProfile() call is still accepted but deprecated.)",
        );
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
