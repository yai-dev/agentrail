/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

export interface Taxonomy {
  [category: string]: Taxonomy | Record<string, never>;
}

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

export interface KnowledgeIndex {
  kbId: string;
  kbDir: string;
  documentCount: number;
  taxonomy: Taxonomy;
  topics: Array<{ topic: string; hasIndex: boolean; docCount: number }>;
}

export type IngestionStep =
  | "analyze"
  | "classify"
  | "summarize"
  | "index_update"
  | "register";

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

export type IngestionEvent =
  | { type: "job_created"; jobId: string; docId: string }
  | { type: "step_start"; step: IngestionStep; message: string }
  | { type: "step_complete"; step: IngestionStep }
  | { type: "step_error"; step: IngestionStep; error: string }
  | { type: "job_complete"; meta: KBDocMeta }
  | { type: "job_failed"; error: string };

export interface SearchResult {
  docId: string;
  path: string;
  lineNumber: number;
  line: string;
  context: string[];
}

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
