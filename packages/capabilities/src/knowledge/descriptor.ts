/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { CapabilityBuildContext, CapabilityDescriptor } from "@/types.js";
import { createKbListTool, createKbReadTool, createKbSearchTool } from "@/knowledge/kb-tools.js";
import type { KnowledgeManager } from "@/knowledge/knowledge-manager.js";

/**
 * Capability that provides knowledge-base tools:
 * kb-list, kb-read, and kb-search.
 *
 * @param manager – The KnowledgeManager instance managing this tenant's KBs.
 * @see {@link https://agentrail.run/capabilities/knowledge}
 */
export function knowledge(manager: KnowledgeManager): CapabilityDescriptor {
  return {
    type: "knowledge",

    async buildTools(ctx: CapabilityBuildContext) {
      const km = ctx.knowledgeManager ?? manager;
      const { tenantId } = ctx;

      return [
        createKbListTool(km, tenantId),
        createKbReadTool(km, tenantId),
        createKbSearchTool(km, tenantId),
      ];
    },
  };
}
