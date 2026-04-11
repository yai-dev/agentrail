/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useState } from "react";

interface Props {
  initialTenantId: string;
  initialUserId: string;
  onSave: (tenantId: string, userId: string) => void;
  onCancel?: () => void;
}

export function SettingsModal({ initialTenantId, initialUserId, onSave, onCancel }: Props) {
  const [tenantId, setTenantId] = useState(initialTenantId);
  const [userId, setUserId] = useState(initialUserId);
  const [error, setError] = useState("");

  const handleSave = () => {
    const t = tenantId.trim();
    const u = userId.trim();
    if (!t || !u) {
      setError("Tenant ID and User ID are both required.");
      return;
    }
    setError("");
    onSave(t, u);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape" && onCancel) onCancel();
  };

  const isSetup = !onCancel;

  return (
    <div className="settings-overlay" onKeyDown={handleKeyDown}>
      <div className="settings-card">
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
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
          <div>
            <div className="settings-title">
              {isSetup ? "Welcome to Agentrail" : "Identity Settings"}
            </div>
            <div className="settings-subtitle">
              {isSetup
                ? "Enter your Tenant ID and User ID to get started"
                : "Update your Tenant ID and User ID to continue"}
            </div>
          </div>
        </div>

        <div className="settings-fields">
          <div className="settings-field">
            <label className="settings-label" htmlFor="settings-tenant-id">
              Tenant ID
            </label>
            <input
              id="settings-tenant-id"
              className="settings-input"
              type="text"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="e.g. acme-corp"
              autoFocus
              autoComplete="off"
            />
          </div>
          <div className="settings-field">
            <label className="settings-label" htmlFor="settings-user-id">
              User ID
            </label>
            <input
              id="settings-user-id"
              className="settings-input"
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g. alice"
              autoComplete="off"
            />
          </div>
        </div>

        {error && <div className="settings-error">{error}</div>}

        <div className="settings-actions">
          {onCancel && (
            <button className="settings-btn-cancel" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button className="settings-btn-save" onClick={handleSave}>
            {isSetup ? "Get started" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
