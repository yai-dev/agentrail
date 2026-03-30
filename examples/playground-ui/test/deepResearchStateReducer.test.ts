/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import assert from "node:assert/strict";
import test from "node:test";
import type { DeepResearchState } from "../src/types/deepResearch.js";
import { applyDeepResearchEventToState } from "../src/hooks/deepResearchStateReducer.js";
import { deriveDeepResearchState } from "../src/hooks/useDeepResearchState.js";

test("applyDeepResearchEventToState merges plan, sources, artifacts, and report deltas", () => {
  const initial: DeepResearchState = {
    run: {
      id: "run-ui-test",
      sessionId: "session-ui-test",
      tenantId: "default",
      userId: "user-1",
      query: "Research coding agents",
      title: "Research coding agents",
      status: "running",
      createdAt: "2026-03-27T10:00:00.000Z",
      updatedAt: "2026-03-27T10:00:00.000Z",
    },
    plan: null,
    steps: [],
    sources: [],
    artifacts: [],
    reportMarkdown: "",
    events: [],
  };

  const finalState = [
    {
      type: "deep_research_plan" as const,
      runId: "run-ui-test",
      timestamp: "2026-03-27T10:00:01.000Z",
      plan: {
        title: "Research coding agents",
        researchProfile: {
          mode: "topic_scope" as const,
          aliases: [],
          scopeTerms: ["coding agents"],
          disambiguationNotes: [],
          excludedEntities: [],
          relatedEntities: ["OpenAI"],
          confidence: "high" as const,
          source: "planner" as const,
        },
        steps: [
          {
            type: "research" as const,
            title: "Gather sources",
            description: "Search the web",
          },
        ],
      },
      researchProfile: {
        mode: "topic_scope" as const,
        aliases: [],
        scopeTerms: ["coding agents"],
        disambiguationNotes: [],
        excludedEntities: [],
        relatedEntities: ["OpenAI"],
        confidence: "high" as const,
        source: "planner" as const,
      },
      steps: [
        {
          id: "step-1",
          index: 0,
          type: "research" as const,
          title: "Gather sources",
          description: "Search the web",
          status: "running" as const,
        },
      ],
    },
    {
      type: "deep_research_source" as const,
      runId: "run-ui-test",
      timestamp: "2026-03-27T10:00:02.000Z",
      source: {
        id: "source-1",
        url: "https://example.com",
        normalizedUrl: "https://example.com/",
        title: "Example",
        domain: "example.com",
        fetchedAt: "2026-03-27T10:00:02.000Z",
        usedByStepIds: ["step-1"],
        status: "accepted",
        confidence: "high_confidence" as const,
        tier: "primary" as const,
        evidenceLevel: "body_verified" as const,
        fetchStatus: "success" as const,
      },
    },
    {
      type: "deep_research_source" as const,
      runId: "run-ui-test",
      timestamp: "2026-03-27T10:00:02.500Z",
      source: {
        id: "source-2",
        url: "https://elsewhere.example.com",
        normalizedUrl: "https://elsewhere.example.com/",
        title: "Elsewhere",
        domain: "elsewhere.example.com",
        fetchedAt: "2026-03-27T10:00:02.500Z",
        usedByStepIds: ["step-1"],
        status: "related_but_excluded",
        excludeReason: "same-name but different company",
        note: "same-name but different company",
      },
    },
    {
      type: "deep_research_artifact" as const,
      runId: "run-ui-test",
      timestamp: "2026-03-27T10:00:03.000Z",
      artifact: {
        id: "artifact-1",
        path: "/workspace/.deep-research/artifacts/chart.png",
        title: "Chart",
        mimeType: "image/png",
        kind: "chart" as const,
        createdAt: "2026-03-27T10:00:03.000Z",
        stepId: "step-1",
      },
    },
    {
      type: "deep_research_report_delta" as const,
      runId: "run-ui-test",
      timestamp: "2026-03-27T10:00:04.000Z",
      delta: "# Report",
    },
  ].reduce((state, event) => applyDeepResearchEventToState(state, event), initial);

  assert.equal(finalState.plan?.title, "Research coding agents");
  assert.equal(finalState.steps.length, 1);
  assert.equal(finalState.sources[0]?.domain, "example.com");
  assert.equal(finalState.artifacts[0]?.kind, "chart");
  assert.equal(finalState.reportMarkdown, "# Report");
  assert.equal(finalState.events.length, 5);
  assert.equal(finalState.sources[0]?.confidence, "high_confidence");
  assert.equal(finalState.entityProfile?.source, "planner");

  const derived = deriveDeepResearchState(finalState);
  assert.equal(derived?.acceptedSources.length, 1);
  assert.equal(derived?.excludedSources.length, 1);
  assert.equal(derived?.reportPreview, "Report");
});
