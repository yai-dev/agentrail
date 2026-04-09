/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useEffect, useRef, useState } from "react";

interface TokenGateProps {
  onSuccess: (token: string) => void;
}

/**
 * Full-screen login gate shown when the server requires a Bearer token.
 * Validates the entered token by probing /api/sessions with it before saving.
 */
export function TokenGate({ onSuccess }: TokenGateProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    const token = value.trim();
    if (!token) {
      setError("Please enter a token.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/sessions?tenantId=_probe_", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setError("Invalid token, please try again.");
      } else {
        onSuccess(token);
      }
    } catch {
      setError("Unable to reach the server. Please check your network.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-overlay">
      <div className="settings-card" style={{ maxWidth: 400 }}>
        <div className="settings-header">
          <div className="settings-icon">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <div className="settings-title">Access Required</div>
            <div className="settings-subtitle">Enter your access token to continue</div>
          </div>
        </div>

        <div className="settings-fields">
          <div className="settings-field">
            <label className="settings-label">Secret Token</label>
            <input
              ref={inputRef}
              className="settings-input"
              type="password"
              placeholder="Enter access token…"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          {error && <div className="settings-error">{error}</div>}
        </div>

        <div className="settings-actions">
          <button
            className="settings-btn-save"
            onClick={() => void submit()}
            disabled={loading || !value.trim()}
            style={{ minWidth: 88 }}
          >
            {loading ? "Verifying…" : "Enter"}
          </button>
        </div>
      </div>
    </div>
  );
}
