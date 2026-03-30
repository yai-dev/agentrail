/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useState, useEffect } from "react";
import { setAuthToken, getAuthToken } from "../api";

/**
 * Manages UI authentication state.
 *
 * On mount, probes the server to check whether auth is required:
 *   - 401 → server has UI_SECRET_TOKEN configured; show TokenGate unless a
 *            saved token is already present in localStorage.
 *   - 200/other → auth not configured; skip the gate entirely.
 *
 * Token is stored in localStorage and kept in sync with api.ts's internal
 * _authToken variable via setAuthToken / getAuthToken.
 */
export function useAuth() {
  const [token, setTokenState] = useState<string>(() => getAuthToken());
  // null = still probing; true = auth required; false = auth disabled on server
  const [authRequired, setAuthRequired] = useState<boolean | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/sessions?tenantId=_probe_", { signal: ctrl.signal, cache: "no-store" })
      .then((res) => {
        if (ctrl.signal.aborted) return;
        setAuthRequired(res.status === 401);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          // Network error: assume auth not required so the app can still load
          setAuthRequired(false);
        }
      });
    return () => ctrl.abort();
  }, []);

  const saveToken = (t: string) => {
    setAuthToken(t);
    setTokenState(t);
  };

  const clearToken = () => {
    setAuthToken("");
    setTokenState("");
  };

  // Still probing → not ready
  const authReady = authRequired !== null;
  // Auth not required by server, OR we have a saved token
  const isAuthed = authRequired === false || (authRequired === true && !!token);

  return { token, isAuthed, authReady, authRequired: authRequired ?? false, saveToken, clearToken };
}
