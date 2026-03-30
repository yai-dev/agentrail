/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useEffect, useMemo, useState } from "react";
import type { DeepResearchDerivedState, DeepResearchState } from "../types/deepResearch.js";

interface Props {
  state: DeepResearchState | null;
  derived: DeepResearchDerivedState | null;
  onOpenPanel: () => void;
}

function statusLabel(status: DeepResearchState["run"]["status"]): string {
  if (status === "running") return "运行中";
  if (status === "completed") return "已完成";
  return "失败";
}

function statusClass(status: DeepResearchState["run"]["status"]): string {
  if (status === "running") return "running";
  if (status === "completed") return "completed";
  return "failed";
}

export function DeepResearchRunCard({ state, derived, onOpenPanel }: Props) {
  // The inline card is intentionally compact: enough progress and evidence
  // context to keep the chat readable, with the full detail moved to the side
  // panel on demand.
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    setExpanded(state?.run.status === "running");
  }, [state?.run.id, state?.run.status]);

  const progress = useMemo(() => {
    if (!state || !derived || state.steps.length === 0) return 0;
    return Math.round((derived.completedStepCount / state.steps.length) * 100);
  }, [derived, state]);

  if (!state || !derived) return null;

  const recentAcceptedSources = derived.acceptedSources.slice(0, 3);
  const latestText = derived.reportPreview || derived.latestStepSummary;

  return (
    <section className="deep-research-inline-card">
      <div className="deep-research-inline-top">
        <button
          className={`deep-research-inline-toggle ${expanded ? "expanded" : ""}`}
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? "折叠深度研究进度" : "展开深度研究进度"}
        >
          <span className="deep-research-inline-chevron">›</span>
        </button>

        <div className="deep-research-inline-main">
          <div className="deep-research-inline-header">
            <div>
              <div className="deep-research-inline-kicker">深度研究</div>
              <h3>{state.run.title}</h3>
            </div>
            <span className={`deep-research-inline-status ${statusClass(state.run.status)}`}>
              {statusLabel(state.run.status)}
            </span>
          </div>

          <div className="deep-research-inline-meta">
            <span>{derived.completedStepCount}/{state.steps.length || 0} 步完成</span>
            <span>{derived.acceptedSources.length} 个有效来源</span>
            {derived.excludedSources.length > 0 && (
              <span>{derived.excludedSources.length} 个已排除来源</span>
            )}
            {derived.activeStep && (
              <span>当前：{derived.activeStep.title}</span>
            )}
          </div>

          <div className="deep-research-inline-progress">
            <div className="deep-research-inline-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <button className="deep-research-inline-open-btn" onClick={onOpenPanel}>
          打开完整研究面板
        </button>
      </div>

      {expanded && (
        <div className="deep-research-inline-body">
          <div className="deep-research-inline-section">
            <div className="deep-research-inline-section-title">计划</div>
            <div className="deep-research-inline-steps">
              {state.steps.map((step) => (
                <div key={step.id} className={`deep-research-inline-step ${step.status}`}>
                  <span className="deep-research-inline-step-index">#{step.index + 1}</span>
                  <span className="deep-research-inline-step-title">{step.title}</span>
                  <span className="deep-research-inline-step-type">{step.type}</span>
                  <span className="deep-research-inline-step-status">{step.status}</span>
                </div>
              ))}
            </div>
          </div>

          {latestText && (
            <div className="deep-research-inline-section">
              <div className="deep-research-inline-section-title">
                {derived.reportPreview ? "报告预览" : "最近结论"}
              </div>
              <p className="deep-research-inline-preview">{latestText}</p>
            </div>
          )}

          <div className="deep-research-inline-grid">
            <div className="deep-research-inline-section">
              <div className="deep-research-inline-section-title">最近有效来源</div>
              {recentAcceptedSources.length > 0 ? (
                <div className="deep-research-inline-sources">
                  {recentAcceptedSources.map((source) => (
                    <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="deep-research-inline-source">
                      <span className="deep-research-inline-source-title">{source.title}</span>
                      <span className="deep-research-inline-source-domain">
                        {source.domain}
                        {source.tier ? ` · ${source.tier}` : ""}
                        {source.confidence ? ` · ${source.confidence}` : ""}
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="deep-research-inline-empty">来源整理中…</p>
              )}
            </div>

            {derived.excludedSources.length > 0 && (
              <div className="deep-research-inline-section">
                <div className="deep-research-inline-section-title">已排除来源</div>
                <div className="deep-research-inline-excluded">
                  {derived.excludedSources.slice(0, 3).map((source) => (
                    <div key={source.id} className="deep-research-inline-excluded-item">
                      <span>{source.title}</span>
                      <span>{source.excludeReason ?? source.note ?? "同名或低相关来源"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
