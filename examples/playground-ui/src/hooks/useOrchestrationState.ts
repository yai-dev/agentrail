/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type {
  OrchestrationState,
  OrchestrationStreamEvent,
} from "../types/orchestration.js";
import { fetchOrchestrationState } from "../api.js";
import {
  applyEventToState,
  createStateFromEvent,
} from "./orchestrationStateReducer.js";

/**
 * Result type for useOrchestrationState hook.
 */
export interface UseOrchestrationStateResult {
  /** Current orchestration state, null if not loaded or no data */
  state: OrchestrationState | null;
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Feed a live SSE event into the state */
  feedEvent: (event: OrchestrationStreamEvent) => void;
  /** Clear all state (call when session changes) */
  clearState: () => void;
  /** Manually refresh state from server */
  refresh: () => Promise<void>;
}

/**
 * Accumulates orchestration events into a state object.
 *
 * - Loads persisted state when sessionId changes
 * - Merges live SSE events into state
 - Exposes summary and expanded trace data separately
 *
 * @param sessionId The session ID to track orchestration for, or null
 * @returns Orchestration state and control functions
 */
export function useOrchestrationState(
  sessionId: string | null
): UseOrchestrationStateResult {
  const [state, setState] = useState<OrchestrationState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load initial state when sessionId changes
  useEffect(() => {
    if (!sessionId) {
      setState(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    fetchOrchestrationState(sessionId, abortControllerRef.current.signal)
      .then((data) => {
        setState(data);
      })
      .catch(() => {
        // Keep existing state on error, or null if none
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [sessionId]);

  /**
   * Feed a live SSE event into the state.
   * Updates local state to reflect the event without re-fetching.
   */
  const feedEvent = useCallback((event: OrchestrationStreamEvent) => {
    setState((prev) => {
      if (!prev) {
        // No existing state, create minimal state from event
        return createStateFromEvent(event);
      }
      return applyEventToState(prev, event);
    });
  }, []);

  /** Clear all state. Call when switching sessions. */
  const clearState = useCallback(() => {
    setState(null);
    setIsLoading(false);
  }, []);

  /** Manually refresh state from the server. */
  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const data = await fetchOrchestrationState(sessionId);
      setState(data);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  return {
    state,
    isLoading,
    feedEvent,
    clearState,
    refresh,
  };
}
