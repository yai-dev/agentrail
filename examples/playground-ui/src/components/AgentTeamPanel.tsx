/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

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

  const hasFailedAgent = state.agents.some((agent) =>
    agent.lastJob?.outcome === "failed" ||
    agent.lastJob?.outcome === "cancelled" ||
    agent.lastJob?.outcome === "timed_out",
  );
  return hasFailedAgent ? "failed" : "completed";
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

  const statusClass = `run-status-${displayedStatus}`;

  return (
    <div className="agent-team-run-card">
      <div className="run-card-header">
        <span className="run-card-label">Run</span>
        <span className={`run-status-badge ${statusClass}`}>
          {displayedStatus === "running" && <span className="status-dot-pulse" />}
          {statusLabels[displayedStatus] || displayedStatus}
        </span>
      </div>
      <div className="run-card-id" title={run.id}>
        {run.id.slice(0, 12)}…
      </div>
      <div className="run-card-time">
        <span>创建于 {new Date(run.createdAt).toLocaleString()}</span>
        <span>更新于 {new Date(run.updatedAt).toLocaleString()}</span>
      </div>
      <div className="agent-team-run-stats">
        <span className="deep-research-stat-pill">活跃 {activeCount}</span>
        <span className="deep-research-stat-pill">已关闭 {closedCount}</span>
        <span className="deep-research-stat-pill">等待条件 {waitCount}</span>
      </div>
    </div>
  );
}

export function AgentTeamPanel({ state, isLoading }: AgentTeamPanelProps) {
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
          <h4 className="agent-team-section-title">
            活跃 Agent ({activeAgents.length})
          </h4>
          <div className="agent-team-grid">
            {activeAgents.map((agent) => (
              <SubAgentCard key={agent.id} agent={agent} isActive />
            ))}
          </div>
        </div>
      )}

      {closedAgents.length > 0 && (
        <div className="agent-team-section">
          <h4 className="agent-team-section-title collapsed">
            已关闭的子智能体 ({closedAgents.length})
          </h4>
          {roleSummary.length > 0 && (
            <div className="agent-team-role-summary">
              {roleSummary.map(([role, count]) => (
                <span key={role} className="deep-research-stat-pill">
                  {role} {count}
                </span>
              ))}
            </div>
          )}
          <div className={`agent-team-grid ${compactClosedCards ? "compact" : ""}`}>
            {closedAgents.map((agent) => (
              <SubAgentCard key={agent.id} agent={agent} compact={compactClosedCards} />
            ))}
          </div>
        </div>
      )}

      {state.waits.length > 0 && (
        <div className="agent-team-section">
          <h4 className="agent-team-section-title">
            等待条件 ({state.waits.length})
          </h4>
          <div className="agent-team-waits">
            {state.waits.map((wait) => (
              <div key={wait.id} className={`wait-item wait-status-${wait.status}`}>
                <span className="wait-id">{wait.id.slice(0, 8)}…</span>
                <span className="wait-mode">{wait.mode === "any" ? "任意" : "全部"}</span>
                <span className="wait-agents">{wait.agentIds.length} 个 Agent</span>
                <span className={`wait-status wait-status-${wait.status}`}>
                  {wait.status === "pending" ? "等待中" : wait.status === "resolved" ? "已解决" : "超时"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
