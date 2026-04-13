/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useEffect, useState } from "react";
import { respondToPermission } from "../api";

export interface PendingPermissionState {
  toolCallId: string;
  toolName: string;
  reason?: string;
}

interface PermissionApprovalPromptProps {
  sessionId: string | null;
  pendingPermission: PendingPermissionState | null;
  onDismiss: () => void;
}

export function PermissionApprovalPrompt({
  sessionId,
  pendingPermission,
  onDismiss,
}: PermissionApprovalPromptProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset interaction state whenever a new permission request arrives.
  useEffect(() => {
    setSubmitting(false);
    setError(null);
  }, [pendingPermission?.toolCallId]);

  if (!pendingPermission) return null;

  const { toolName, reason } = pendingPermission;

  const respond = async (decision: "approved" | "rejected") => {
    if (!sessionId || submitting) return;
    setSubmitting(true);
    setError(null);
    const ok = await respondToPermission(sessionId, decision);
    if (ok) {
      onDismiss();
    } else {
      setError("Failed to send decision — please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="permission-approval-bar">
      <div className="permission-approval-content">
        <span className="permission-approval-icon">🔐</span>
        <div className="permission-approval-text">
          <span className="permission-approval-label">Permission required</span>
          <span className="permission-approval-tool">
            Allow <strong>{toolName}</strong> to run?
          </span>
          {reason && <span className="permission-approval-reason">{reason}</span>}
          {error && <span className="permission-approval-error">{error}</span>}
        </div>
      </div>
      <div className="permission-approval-actions">
        <button
          className="permission-approval-btn permission-approval-approve"
          disabled={submitting}
          onClick={() => void respond("approved")}
        >
          {submitting ? "…" : "Approve"}
        </button>
        <button
          className="permission-approval-btn permission-approval-reject"
          disabled={submitting}
          onClick={() => void respond("rejected")}
        >
          {submitting ? "…" : "Reject"}
        </button>
      </div>
    </div>
  );
}
