/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

export interface Taxonomy {
  [category: string]: Taxonomy | Record<string, never>;
}

/** Metadata recorded for one stored knowledge-base document. */
export interface KBDocMeta {
  docId: string;
  title: string;
  status: "pending" | "processing" | "ready" | "failed";
  category: string[];
  topics: string[];
  /** Extracted from <!-- summary: ... --> comment in the document */
  summary: string | null;
  /** Path relative to kbDir */
  path: string;
  sizeTokensApprox: number;
  createdAt: number;
  updatedAt: number;
}

/** Searchable topic index for a knowledge base. */
export interface KnowledgeIndex {
  kbId: string;
  kbDir: string;
  documentCount: number;
  taxonomy: Taxonomy;
  topics: Array<{ topic: string; hasIndex: boolean; docCount: number }>;
}

/** Ordered pipeline step used during document ingestion. */
export type IngestionStep = "analyze" | "classify" | "summarize" | "index_update" | "register";

/** Status record for one knowledge-base ingestion job. */
export interface IngestionJob {
  jobId: string;
  docId: string;
  status: "pending" | "processing" | "ready" | "failed";
  steps: Array<{
    step: IngestionStep;
    status: "pending" | "done" | "error";
    error?: string;
  }>;
  createdAt: number;
  updatedAt: number;
}

/** Progress event emitted while a knowledge-base document is ingested. */
export type IngestionEvent =
  | { type: "job_created"; jobId: string; docId: string }
  | { type: "step_start"; step: IngestionStep; message: string }
  | { type: "step_complete"; step: IngestionStep }
  | { type: "step_error"; step: IngestionStep; error: string }
  | { type: "job_complete"; meta: KBDocMeta }
  | { type: "job_failed"; error: string };

/** Search hit returned from a knowledge-base query. */
export interface SearchResult {
  docId: string;
  path: string;
  lineNumber: number;
  line: string;
  context: string[];
}

/** High-level metadata summary for one knowledge base. */
export interface KBMetadata {
  kbId: string;
  name: string;
  description: string;
  kbDir: string;
  documentCount: number;
  taxonomy: Taxonomy;
  topics: Array<{ topic: string; hasIndex: boolean; docCount: number }>;
  recentDocs: Array<{
    docId: string;
    title: string;
    summary: string | null;
    category: string[];
    updatedAt: number;
  }>;
  updatedAt: number;
}
