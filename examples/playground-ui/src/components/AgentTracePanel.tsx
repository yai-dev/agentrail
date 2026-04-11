/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useState } from "react";
import type { OrchestrationEvent, OrchestrationState } from "../types/orchestration.js";

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
    run_started: "Run Started",
    orchestration_run_start: "Run Started",
    agent_spawned: "Agent Spawned",
    subagent_spawned: "Agent Spawned",
    agent_status_changed: "Status Changed",
    subagent_status: "Status Changed",
    agent_job_started: "Job Started",
    subagent_job_started: "Job Started",
    agent_job_completed: "Job Completed",
    subagent_job_completed: "Job Completed",
    agent_job_failed: "Job Failed",
    subagent_job_failed: "Job Failed",
    agent_input_queued: "Input Queued",
    subagent_message: "Input Queued",
    wait_registered: "Wait Registered",
    wait_resolved: "Wait Resolved",
    agent_closed: "Agent Closed",
    subagent_closed: "Agent Closed",
    run_completed: "Run Completed",
    orchestration_run_complete: "Run Completed",
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
      <div
        className="agent-trace-row-header"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggle()}
      >
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
          <p>No events recorded</p>
          <p className="agent-trace-empty-hint">
            Orchestration events will appear here as detailed logs.
          </p>
        </div>
      </div>
    );
  }

  const filteredEvents = state.events.filter((event) => {
    if (filter === "all") return true;
    if (filter === "agent")
      return event.type.startsWith("agent_") || event.type.startsWith("subagent_");
    if (filter === "wait") return event.type.startsWith("wait_");
    if (filter === "run")
      return event.type.startsWith("run_") || event.type.startsWith("orchestration_");
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
            { key: "all", label: "All" },
            { key: "agent", label: "Agent" },
            { key: "wait", label: "Wait" },
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
            Expand all
          </button>
          <button className="agent-trace-action-btn" onClick={collapseAll}>
            Collapse all
          </button>
        </div>
      </div>

      <div className="agent-trace-count">{filteredEvents.length} events</div>

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
