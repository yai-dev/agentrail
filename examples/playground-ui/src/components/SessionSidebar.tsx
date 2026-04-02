/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useState } from "react";
import type { SessionMeta } from "../hooks/useSessions";
import { KnowledgePanel } from "./KnowledgePanel";

type SidebarTab = "chats" | "knowledge";

interface Props {
  sessions: SessionMeta[];
  currentSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
  onDelete: (sessionId: string) => void;
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function SessionSidebar({ sessions, currentSessionId, onSelect, onNew, onDelete }: Props) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("chats");

  return (
    <aside className="session-sidebar">
      {/* Tab bar */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === "chats" ? "active" : ""}`}
          onClick={() => setActiveTab("chats")}
        >
          会话
        </button>
        <button
          className={`sidebar-tab ${activeTab === "knowledge" ? "active" : ""}`}
          onClick={() => setActiveTab("knowledge")}
        >
          知识库
        </button>
      </div>

      {activeTab === "chats" ? (
        <>
          <div className="sidebar-header">
            <span className="sidebar-title">会话</span>
            <button className="new-session-btn" onClick={onNew} title="New session">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          <div className="session-list">
            {sessions.length === 0 ? (
              <div className="session-empty">暂无会话</div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.sessionId}
                  className={`session-item ${s.sessionId === currentSessionId ? "active" : ""}`}
                  onClick={() => onSelect(s.sessionId)}
                >
                  <div className="session-item-inner">
                    <div className="session-item-title">
                      {s.title ?? (s.lastMessage.slice(0, 32) || "新会话")}
                    </div>
                    <div className="session-item-meta">{formatRelativeTime(s.updatedAt)}</div>
                  </div>
                  <button
                    className="session-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(s.sessionId);
                    }}
                    title="删除会话"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <KnowledgePanel />
      )}
    </aside>
  );
}
