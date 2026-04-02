/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useState } from "react";
import type { OrchestrationState } from "../types/orchestration.js";
import { SubAgentCard } from "./SubAgentCard.js";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState.js";

interface AgentTeamPanelProps {
  state: OrchestrationState | null;
  isLoading: boolean;
}

function deriveDisplayedRunStatus(state: OrchestrationState): "running" | "completed" | "failed" {
  if (!state.run) return "completed";
  if (state.run.status !== "running") return state.run.status;

  const hasActiveAgents = state.agents.some((agent) => agent.status !== "closed");
  const hasPendingWaits = state.waits.some((wait) => wait.status === "pending");
  if (hasActiveAgents || hasPendingWaits) return "running";

  const hasFailedAgent = state.agents.some(
    (agent) =>
      agent.lastJob?.outcome === "failed" ||
      agent.lastJob?.outcome === "cancelled" ||
      agent.lastJob?.outcome === "timed_out",
  );
  return hasFailedAgent ? "failed" : "completed";
}

function formatDuration(startIso: string, endIso?: string): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const sec = Math.floor((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}

function RunSummaryCard({
  run,
  displayedStatus,
  activeCount,
  closedCount,
  waitCount,
}: {
  run: OrchestrationState["run"];
  displayedStatus: "running" | "completed" | "failed";
  activeCount: number;
  closedCount: number;
  waitCount: number;
}) {
  if (!run) return null;

  const statusLabels: Record<string, string> = {
    running: "运行中",
    completed: "已完成",
    failed: "失败",
  };

  const shortId = run.id.slice(-4).toUpperCase();
  const duration = formatDuration(
    run.createdAt,
    displayedStatus !== "running" ? run.updatedAt : undefined,
  );

  return (
    <div className={`agent-team-run-card run-card-status-${displayedStatus}`}>
      <div className="run-card-header">
        <span className="run-card-label">RUN · #{shortId}</span>
        <span className={`run-status-badge run-status-${displayedStatus}`}>
          {displayedStatus === "running" && <span className="status-dot-pulse" />}
          {statusLabels[displayedStatus] || displayedStatus}
        </span>
      </div>
      <div className="run-card-duration">
        {displayedStatus === "running" ? "已运行 " : "耗时 "}
        <strong>{duration}</strong>
      </div>
      <div className="agent-team-run-stats">
        <span className="agent-team-stat-pill">◉ 活跃 {activeCount}</span>
        <span className="agent-team-stat-pill">✓ 已关闭 {closedCount}</span>
        {waitCount > 0 && (
          <span className="agent-team-stat-pill agent-team-stat-pill-wait">
            ⏳ 等待 {waitCount}
          </span>
        )}
      </div>
    </div>
  );
}

export function AgentTeamPanel({ state, isLoading }: AgentTeamPanelProps) {
  const [closedExpanded, setClosedExpanded] = useState(false);

  if (isLoading) {
    return (
      <WorkspaceEmptyState
        icon="◌"
        title="正在加载智能体团队"
        description="正在恢复主智能体、子智能体以及等待条件的状态，请稍候。"
      />
    );
  }

  if (!state || (!state.run && state.agents.length === 0)) {
    return (
      <WorkspaceEmptyState
        icon="⬢"
        title="还没有智能体团队活动"
        description="当主智能体派生子智能体、分配任务或等待子流程完成时，这里会显示完整的协作情况。"
      />
    );
  }

  const activeAgents = state.agents.filter((a) => a.status !== "closed");
  const closedAgents = state.agents.filter((a) => a.status === "closed");
  const displayedRunStatus = deriveDisplayedRunStatus(state);
  const roleSummary = Array.from(
    closedAgents.reduce((map, agent) => {
      map.set(agent.role, (map.get(agent.role) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  );
  const compactClosedCards = closedAgents.length > 4;

  const waitIcons: Record<string, string> = {
    pending: "⏳",
    resolved: "✓",
    timeout: "⚠",
  };
  const waitColors: Record<string, string> = {
    pending: "wait-status-pending",
    resolved: "wait-status-resolved",
    timeout: "wait-status-timeout",
  };

  return (
    <div className="agent-team-panel">
      {state.run && (
        <RunSummaryCard
          run={state.run}
          displayedStatus={displayedRunStatus}
          activeCount={activeAgents.length}
          closedCount={closedAgents.length}
          waitCount={state.waits.length}
        />
      )}

      {activeAgents.length > 0 && (
        <div className="agent-team-section">
          <h4 className="agent-team-section-title">活跃 Agent ({activeAgents.length})</h4>
          <div className="agent-team-grid">
            {activeAgents.map((agent) => (
              <SubAgentCard key={agent.id} agent={agent} isActive />
            ))}
          </div>
        </div>
      )}

      {closedAgents.length > 0 && (
        <div className="agent-team-section">
          <button
            className="agent-team-section-title agent-team-section-toggle"
            onClick={() => setClosedExpanded((v) => !v)}
            aria-expanded={closedExpanded}
          >
            <span>已关闭的子智能体 ({closedAgents.length})</span>
            <span className="agent-team-chevron">{closedExpanded ? "▾" : "▸"}</span>
          </button>
          {roleSummary.length > 0 && (
            <div className="agent-team-role-summary">
              {roleSummary.map(([role, count]) => (
                <span key={role} className="agent-team-stat-pill">
                  {role} · {count}
                </span>
              ))}
            </div>
          )}
          {closedExpanded && (
            <div className={`agent-team-grid ${compactClosedCards ? "compact" : ""}`}>
              {closedAgents.map((agent) => (
                <SubAgentCard key={agent.id} agent={agent} compact={compactClosedCards} />
              ))}
            </div>
          )}
        </div>
      )}

      {state.waits.length > 0 && (
        <div className="agent-team-section">
          <h4 className="agent-team-section-title">等待条件 ({state.waits.length})</h4>
          <div className="agent-team-waits">
            {state.waits.map((wait) => (
              <div key={wait.id} className={`wait-item wait-status-${wait.status}`}>
                <span className="wait-icon">{waitIcons[wait.status] ?? "·"}</span>
                <span className="wait-mode-badge">{wait.mode === "any" ? "任意" : "全部"}</span>
                <span className="wait-agents-count">{wait.agentIds.length} 个 Agent</span>
                <span className={`wait-status-label ${waitColors[wait.status] ?? ""}`}>
                  {wait.status === "pending"
                    ? "等待中"
                    : wait.status === "resolved"
                      ? "已解决"
                      : "超时"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
