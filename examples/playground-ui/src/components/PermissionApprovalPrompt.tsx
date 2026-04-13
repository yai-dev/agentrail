/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

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
  if (!pendingPermission) return null;

  const { toolName, reason } = pendingPermission;

  const respond = async (decision: "approved" | "rejected") => {
    if (!sessionId) return;
    onDismiss();
    await respondToPermission(sessionId, decision);
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
        </div>
      </div>
      <div className="permission-approval-actions">
        <button
          className="permission-approval-btn permission-approval-approve"
          onClick={() => void respond("approved")}
        >
          Approve
        </button>
        <button
          className="permission-approval-btn permission-approval-reject"
          onClick={() => void respond("rejected")}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
