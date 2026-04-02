/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDeepResearchState } from "../api.js";
import type {
  DeepResearchDerivedState,
  DeepResearchState,
  DeepResearchStreamEvent,
} from "../types/deepResearch.js";
import {
  applyDeepResearchEventToState,
  createDeepResearchStateFromEvent,
} from "./deepResearchStateReducer.js";

export interface UseDeepResearchStateResult {
  state: DeepResearchState | null;
  derived: DeepResearchDerivedState | null;
  isLoading: boolean;
  feedEvent: (event: DeepResearchStreamEvent) => void;
  clearState: () => void;
}

function stripMarkdownPreview(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[.*?\]\(.*?\)/g, " ")
    .replace(/\[([^\]]+)\]\((.*?)\)/g, "$1")
    .replace(/[*_>#|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toPreview(text: string, limit = 220): string {
  const stripped = stripMarkdownPreview(text);
  if (stripped.length <= limit) return stripped;
  return `${stripped.slice(0, limit).trimEnd()}...`;
}

export function deriveDeepResearchState(
  state: DeepResearchState | null,
): DeepResearchDerivedState | null {
  // The inline card and panel both need a few "display-ready" fields such as
  // the active step and short previews. We compute them here so the rendering
  // components can stay simple.
  if (!state) return null;

  const activeStep =
    state.steps.find((step) => step.status === "running") ??
    [...state.steps].reverse().find((step) => step.status === "pending") ??
    null;
  const completedStepCount = state.steps.filter((step) => step.status === "completed").length;
  const latestSummaryStep = [...state.steps]
    .reverse()
    .find((step) => (step.summary ?? "").trim().length > 0);
  const latestStepSummary = latestSummaryStep?.summary ? toPreview(latestSummaryStep.summary) : "";
  const reportPreview = state.reportMarkdown ? toPreview(state.reportMarkdown, 320) : "";
  const acceptedSources = state.sources.filter(
    (source) => (source.status ?? "accepted") === "accepted",
  );
  const excludedSources = state.sources.filter(
    (source) => source.status === "related_but_excluded",
  );

  return {
    activeStep,
    completedStepCount,
    latestStepSummary,
    reportPreview,
    acceptedSources,
    excludedSources,
  };
}

export function useDeepResearchState(sessionId: string | null): UseDeepResearchStateResult {
  const [state, setState] = useState<DeepResearchState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Each session keeps only its latest Deep Research run in the inline UI, so
    // switching sessions resets local state and reloads the most recent run
    // snapshot from the server.
    if (!sessionId) {
      setState(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    fetchDeepResearchState(sessionId, abortControllerRef.current.signal)
      .then((data) => {
        setState(data);
      })
      .catch(() => {})
      .finally(() => {
        setIsLoading(false);
      });

    return () => abortControllerRef.current?.abort();
  }, [sessionId]);

  const feedEvent = useCallback((event: DeepResearchStreamEvent) => {
    // Streaming events arrive incrementally over SSE. We rebuild the client
    // state purely from event application so the inline card and side panel stay
    // in sync.
    setState((prev) => {
      if (!prev) {
        return createDeepResearchStateFromEvent(event);
      }
      return applyDeepResearchEventToState(prev, event);
    });
  }, []);

  const clearState = useCallback(() => {
    setState(null);
    setIsLoading(false);
  }, []);

  return { state, derived: deriveDeepResearchState(state), isLoading, feedEvent, clearState };
}
