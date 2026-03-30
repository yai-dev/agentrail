/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { DeepResearchState, DeepResearchStreamEvent } from "../types/deepResearch.js";

// The reducer is the single place where the streaming event feed is converted
// into the current Deep Research UI state.
function appendEvent(state: DeepResearchState, event: DeepResearchStreamEvent): DeepResearchState {
  return {
    ...state,
    events: [...state.events, event],
  };
}

export function createDeepResearchStateFromEvent(
  event: DeepResearchStreamEvent,
): DeepResearchState | null {
  if (event.type !== "deep_research_start") return null;
  return {
    run: event.run,
    plan: null,
    steps: [],
    sources: [],
    artifacts: [],
    reportMarkdown: "",
    entityProfile: null,
    events: [event],
  };
}

export function applyDeepResearchEventToState(
  state: DeepResearchState,
  event: DeepResearchStreamEvent,
): DeepResearchState {
  switch (event.type) {
    case "deep_research_start":
      return appendEvent(
        {
          ...state,
          run: event.run,
        },
        event,
      );
    case "deep_research_plan":
      return appendEvent(
        {
          ...state,
          plan: event.plan,
          entityProfile: event.researchProfile ?? event.plan.researchProfile ?? state.entityProfile ?? null,
          steps: event.steps,
        },
        event,
      );
    case "deep_research_step":
      return appendEvent(
        {
          ...state,
          entityProfile: event.entityProfile ?? state.entityProfile ?? null,
          steps: state.steps.some((step) => step.id === event.step.id)
            ? state.steps.map((step) => (step.id === event.step.id ? event.step : step))
            : [...state.steps, event.step],
        },
        event,
      );
    case "deep_research_source":
      return appendEvent(
        {
          ...state,
          sources: state.sources.some((source) => source.id === event.source.id)
            ? state.sources.map((source) => (source.id === event.source.id ? event.source : source))
            : [...state.sources, event.source],
        },
        event,
      );
    case "deep_research_artifact":
      return appendEvent(
        {
          ...state,
          artifacts: state.artifacts.some((artifact) => artifact.id === event.artifact.id)
            ? state.artifacts.map((artifact) => (artifact.id === event.artifact.id ? event.artifact : artifact))
            : [...state.artifacts, event.artifact],
        },
        event,
      );
    case "deep_research_report_delta":
      return appendEvent(
        {
          ...state,
          reportMarkdown: `${state.reportMarkdown}${event.delta}`,
        },
        event,
      );
    case "deep_research_complete":
      return appendEvent(
        {
          ...state,
          run: {
            ...state.run,
            status: event.status,
            updatedAt: event.timestamp,
            ...(event.status === "completed" ? { completedAt: event.timestamp } : {}),
            ...(event.error ? { error: event.error } : {}),
          },
          reportMarkdown: event.reportMarkdown,
        },
        event,
      );
    default:
      return state;
  }
}
