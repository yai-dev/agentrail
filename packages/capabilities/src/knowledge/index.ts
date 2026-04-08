/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

export { createKbListTool, createKbReadTool, createKbSearchTool } from "@/knowledge/kb-tools.js";
export { KnowledgeManager } from "@/knowledge/knowledge-manager.js";
export type {
  IngestionEvent,
  IngestionJob,
  IngestionStep,
  KBDocMeta,
  KBMetadata,
  KnowledgeIndex,
  SearchResult,
  Taxonomy,
} from "@/knowledge/types.js";
