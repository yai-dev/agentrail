/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { OrchestrationAgent } from "../types/orchestration.js";

interface SubAgentCardProps {
  agent: OrchestrationAgent;
  isActive?: boolean;
  compact?: boolean;
}

function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function StatusBadge({ status }: { status: OrchestrationAgent["status"] }) {
  const statusConfig = {
    idle: { label: "Idle", className: "sub-agent-status-idle" },
    running: { label: "Running", className: "sub-agent-status-running" },
    waiting: { label: "Waiting", className: "sub-agent-status-waiting" },
    closing: { label: "Closing", className: "sub-agent-status-closing" },
    closed: { label: "Closed", className: "sub-agent-status-closed" },
  };

  const config = statusConfig[status];

  return (
    <span className={`sub-agent-status-badge ${config.className}`}>
      {status === "running" && <span className="status-dot-pulse" />}
      {config.label}
    </span>
  );
}

const outcomeIcon: Record<string, string> = {
  completed: "✓",
  failed: "✕",
  cancelled: "✕",
  timed_out: "✕",
};

export function SubAgentCard({ agent, isActive, compact = false }: SubAgentCardProps) {
  const displayName = agent.displayName ?? agent.role;

  const timeParts: string[] = [];
  timeParts.push(`Created ${formatTimeAgo(agent.createdAt)}`);
  if (agent.lastJob?.completedAt) {
    timeParts.push(`Completed ${formatTimeAgo(agent.lastJob.completedAt)}`);
  }
  if (agent.closedAt) {
    timeParts.push(`Closed ${formatTimeAgo(agent.closedAt)}`);
  }

  return (
    <div className={`sub-agent-card ${isActive ? "active" : ""} ${compact ? "compact" : ""}`}>
      <div className="sub-agent-card-header">
        <div className="sub-agent-card-role" title={agent.role}>
          {agent.role}
        </div>
        <StatusBadge status={agent.status} />
      </div>

      <div className="sub-agent-card-name" title={displayName}>
        {displayName}
      </div>

      {!compact && (agent.activeJob || agent.lastJob || agent.mailbox?.closeRequested) && (
        <div className="sub-agent-card-details">
          {agent.activeJob && (
            <div className="sub-agent-card-detail">
              <span className="sub-agent-card-detail-label">Active Job</span>
              <span className="sub-agent-card-detail-value" title={agent.activeJob.jobId}>
                {agent.activeJob.jobId.slice(0, 12)}…
              </span>
            </div>
          )}
          {agent.lastJob && (
            <div className="sub-agent-card-detail">
              <span className="sub-agent-card-detail-label">Last Result</span>
              <span className={`sub-agent-card-detail-value job-outcome-${agent.lastJob.outcome}`}>
                {outcomeIcon[agent.lastJob.outcome] ?? ""} {agent.lastJob.outcome}
              </span>
            </div>
          )}
          {agent.mailbox && (
            <div className="sub-agent-card-detail">
              <span className="sub-agent-card-detail-label">Mailbox</span>
              <span className="sub-agent-card-detail-value">
                {agent.mailbox.processedEventCount} processed
              </span>
            </div>
          )}
          {agent.mailbox?.closeRequested && (
            <div className="sub-agent-card-detail">
              <span className="sub-agent-card-detail-label">Close Request</span>
              <span className="sub-agent-card-detail-value">
                {agent.mailbox.closeRequested.reason ?? "No reason"}
              </span>
            </div>
          )}
        </div>
      )}

      {compact && agent.lastJob && (
        <div className="sub-agent-card-summary">
          <span className={`sub-agent-card-summary-pill job-outcome-${agent.lastJob.outcome}`}>
            {outcomeIcon[agent.lastJob.outcome] ?? ""} {agent.lastJob.outcome}
          </span>
        </div>
      )}

      <div className="sub-agent-card-meta">{timeParts.join(" · ")}</div>
    </div>
  );
}
