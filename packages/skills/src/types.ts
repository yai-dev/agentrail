/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { RuntimeEvent } from "@agentrail/runtime-core";

export interface SkillMeta {
  /** Skill directory name (used as skill identifier) */
  name: string;
  /** Human-readable description from skill.json */
  description: string;
  /** Whether the skill is enabled */
  enabled: boolean;
  /** Absolute path to the skill directory */
  skillDir: string;
}

/** skill.json file schema */
export interface SkillConfig {
  name: string;
  description: string;
  enabled?: boolean;
}

// SSE bracket events: extend the event stream without modifying runtime-core's RuntimeEvent
export type SkillStartEvent = {
  type: "skill_start";
  skillName: string;
  task: string;
};

export type SkillEndEvent = {
  type: "skill_end";
  skillName: string;
};

/**
 * Extended SSE event union used only in the server → UI pipeline.
 * RuntimeEvent from @agentrail/runtime-core is included unchanged.
 */
export type ExtendedSseEvent = RuntimeEvent | SkillStartEvent | SkillEndEvent;
