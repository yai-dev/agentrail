/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// UI-side mirror of the Deep Research data model. The fields are kept close to
// the server types so streamed events can be applied without heavy adaptation.
export type DeepResearchRunStatus = "running" | "completed" | "failed";
export type DeepResearchStepType = "research" | "analysis" | "processing";
export type DeepResearchStepStatus = "pending" | "running" | "completed" | "failed";
export type DeepResearchSourceStatus = "accepted" | "related_but_excluded";
export type DeepResearchSourceConfidence =
  | "high_confidence"
  | "medium_confidence"
  | "low_confidence";
export type DeepResearchSourceTier = "primary" | "supporting";
export type DeepResearchEvidenceLevel =
  | "body_verified"
  | "snippet_only"
  | "unverified";
export type DeepResearchFetchStatus =
  | "success"
  | "401"
  | "403"
  | "timeout"
  | "empty_content"
  | "error"
  | "skipped";

export interface DeepResearchRun {
  id: string;
  sessionId: string;
  tenantId: string;
  userId: string;
  query: string;
  title: string;
  status: DeepResearchRunStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export interface DeepResearchStep {
  id: string;
  index: number;
  type: DeepResearchStepType;
  title: string;
  description: string;
  status: DeepResearchStepStatus;
  startedAt?: string;
  completedAt?: string;
  summary?: string;
  output?: string;
  error?: string;
  digest?: DeepResearchStepDigest;
  evidenceTable?: DeepResearchEvidenceRow[];
  profileUpdateReason?: string;
}

export interface DeepResearchPlan {
  title: string;
  thought?: string;
  researchProfile?: DeepResearchEntityProfile | null;
  steps: Array<{
    type: DeepResearchStepType;
    title: string;
    description: string;
  }>;
}

export interface DeepResearchSource {
  id: string;
  url: string;
  normalizedUrl?: string;
  title: string;
  domain: string;
  snippet?: string;
  publishedAt?: string;
  fetchedAt: string;
  usedByStepIds: string[];
  status?: DeepResearchSourceStatus;
  confidence?: DeepResearchSourceConfidence;
  tier?: DeepResearchSourceTier;
  evidenceLevel?: DeepResearchEvidenceLevel;
  fetchStatus?: DeepResearchFetchStatus;
  excludeReason?: string;
  note?: string;
}

export interface DeepResearchStepDigest {
  stepId: string;
  title: string;
  type: DeepResearchStepType;
  findings: string[];
  sourceIds: string[];
  openQuestions: string[];
  confidence: "high" | "medium" | "low";
}

export interface DeepResearchEntityProfile {
  mode: "entity_disambiguation" | "topic_scope";
  officialName?: string;
  aliases: string[];
  scopeTerms: string[];
  disambiguationNotes: string[];
  excludedEntities: string[];
  relatedEntities: string[];
  confidence: "high" | "medium" | "low";
  source: "planner" | "researcher_upgrade" | "fallback_rules";
}

export interface DeepResearchEvidenceRow {
  claim: string;
  supportingSourceIds: string[];
  confidence: "high" | "medium" | "low";
  conflicts: string[];
  notes: string[];
}

export interface DeepResearchArtifact {
  id: string;
  path: string;
  storedFileName?: string;
  title: string;
  mimeType: string;
  kind: "text" | "table" | "chart" | "data" | "file";
  createdAt: string;
  stepId: string;
}

export interface DeepResearchState {
  run: DeepResearchRun;
  plan: DeepResearchPlan | null;
  steps: DeepResearchStep[];
  sources: DeepResearchSource[];
  artifacts: DeepResearchArtifact[];
  reportMarkdown: string;
  entityProfile?: DeepResearchEntityProfile | null;
  events: DeepResearchStreamEvent[];
}

export interface DeepResearchDerivedState {
  activeStep: DeepResearchStep | null;
  completedStepCount: number;
  latestStepSummary: string;
  reportPreview: string;
  acceptedSources: DeepResearchSource[];
  excludedSources: DeepResearchSource[];
}

export type DeepResearchStreamEvent =
  | {
      type: "deep_research_start";
      run: DeepResearchRun;
      timestamp: string;
    }
  | {
      type: "deep_research_plan";
      runId: string;
      plan: DeepResearchPlan;
      researchProfile?: DeepResearchEntityProfile | null;
      steps: DeepResearchStep[];
      timestamp: string;
    }
  | {
      type: "deep_research_step";
      runId: string;
      step: DeepResearchStep;
      entityProfile?: DeepResearchEntityProfile | null;
      profileUpdateReason?: string;
      timestamp: string;
    }
  | {
      type: "deep_research_source";
      runId: string;
      source: DeepResearchSource;
      timestamp: string;
    }
  | {
      type: "deep_research_artifact";
      runId: string;
      artifact: DeepResearchArtifact;
      timestamp: string;
    }
  | {
      type: "deep_research_report_delta";
      runId: string;
      delta: string;
      timestamp: string;
    }
  | {
      type: "deep_research_complete";
      runId: string;
      status: DeepResearchRunStatus;
      reportMarkdown: string;
      error?: string;
      timestamp: string;
    };
