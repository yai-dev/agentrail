/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

export { SkillManager } from "./skill-manager.js";
export { buildSkillTool } from "./skill-tools.js";
/** Public skill metadata and event types surfaced by the skills package. */
export type {
  ExtendedSseEvent,
  SkillConfig,
  SkillEndEvent,
  SkillMeta,
  SkillStartEvent,
} from "./types.js";
