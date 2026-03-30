/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useState } from "react";
import type { OrchestrationState, OrchestrationEvent } from "../types/orchestration.js";

interface AgentTracePanelProps {
  state: OrchestrationState | null;
}

type EventFilter = "all" | "agent" | "wait" | "run";

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString() + "." + String(date.getMilliseconds()).padStart(3, "0");
}

function getEventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    run_started: "Run 开始",
    orchestration_run_start: "Run 开始",
    agent_spawned: "Agent 创建",
    subagent_spawned: "Agent 创建",
    agent_status_changed: "状态变更",
    subagent_status: "状态变更",
    agent_job_started: "Job 开始",
    subagent_job_started: "Job 开始",
    agent_job_completed: "Job 完成",
    subagent_job_completed: "Job 完成",
    agent_job_failed: "Job 失败",
    subagent_job_failed: "Job 失败",
    agent_input_queued: "输入排队",
    subagent_message: "输入排队",
    wait_registered: "等待注册",
    wait_resolved: "等待解决",
    agent_closed: "Agent 关闭",
    subagent_closed: "Agent 关闭",
    run_completed: "Run 完成",
    orchestration_run_complete: "Run 完成",
  };
  return labels[type] || type;
}

function getEventTypeClass(type: string): string {
  if (type.startsWith("run_") || type.startsWith("orchestration_")) return "event-type-run";
  if (type.startsWith("agent_") || type.startsWith("subagent_")) return "event-type-agent";
  if (type.startsWith("wait_")) return "event-type-wait";
  return "event-type-other";
}

interface EventRowProps {
  event: OrchestrationEvent;
  isExpanded: boolean;
  onToggle: () => void;
}

function EventRow({ event, isExpanded, onToggle }: EventRowProps) {
  const typeLabel = getEventTypeLabel(event.type);
  const typeClass = getEventTypeClass(event.type);

  return (
    <div className={`agent-trace-row ${isExpanded ? "expanded" : ""}`}>
      <div className="agent-trace-row-header" onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onToggle()}>
        <span className={`agent-trace-timestamp`}>{formatTimestamp(event.timestamp)}</span>
        <span className={`agent-trace-type ${typeClass}`}>{typeLabel}</span>
        <span className="agent-trace-id" title={event.id}>
          {event.id.slice(0, 8)}…
        </span>
        <span className={`agent-trace-chevron ${isExpanded ? "open" : ""}`}>›</span>
      </div>

      {isExpanded && (
        <div className="agent-trace-row-detail">
          <pre className="agent-trace-json">{JSON.stringify(event, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export function AgentTracePanel({ state }: AgentTracePanelProps) {
  const [filter, setFilter] = useState<EventFilter>("all");
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  if (!state || state.events.length === 0) {
    return (
      <div className="agent-trace-panel">
        <div className="agent-trace-empty">
          <div className="agent-trace-empty-icon">📋</div>
          <p>暂无事件记录</p>
          <p className="agent-trace-empty-hint">Orchestration 事件将在此显示详细日志。</p>
        </div>
      </div>
    );
  }

  const filteredEvents = state.events.filter((event) => {
    if (filter === "all") return true;
    if (filter === "agent") return event.type.startsWith("agent_") || event.type.startsWith("subagent_");
    if (filter === "wait") return event.type.startsWith("wait_");
    if (filter === "run") return event.type.startsWith("run_") || event.type.startsWith("orchestration_");
    return true;
  });

  const toggleEvent = (id: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedEvents(new Set(filteredEvents.map((e) => e.id)));
  };

  const collapseAll = () => {
    setExpandedEvents(new Set());
  };

  return (
    <div className="agent-trace-panel">
      <div className="agent-trace-toolbar">
        <div className="agent-trace-filters">
          {[
            { key: "all", label: "全部" },
            { key: "agent", label: "Agent" },
            { key: "wait", label: "等待" },
            { key: "run", label: "Run" },
          ].map((f) => (
            <button
              key={f.key}
              className={`agent-trace-filter-btn ${filter === f.key ? "active" : ""}`}
              onClick={() => setFilter(f.key as EventFilter)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="agent-trace-actions">
          <button className="agent-trace-action-btn" onClick={expandAll}>
            展开全部
          </button>
          <button className="agent-trace-action-btn" onClick={collapseAll}>
            收起全部
          </button>
        </div>
      </div>

      <div className="agent-trace-count">共 {filteredEvents.length} 个事件</div>

      <div className="agent-trace-list">
        {filteredEvents.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            isExpanded={expandedEvents.has(event.id)}
            onToggle={() => toggleEvent(event.id)}
          />
        ))}
      </div>
    </div>
  );
}
