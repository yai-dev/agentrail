/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

export type {
  Taxonomy,
  KBDocMeta,
  KnowledgeIndex,
  KBMetadata,
  IngestionStep,
  IngestionJob,
  IngestionEvent,
  SearchResult,
} from "./types.js";
export { KnowledgeManager } from "./knowledge-manager.js";
export { createKbListTool, createKbReadTool, createKbSearchTool } from "./kb-tools.js";
