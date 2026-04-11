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
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  return "Failed";
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
          aria-label={
            expanded ? "Collapse deep research progress" : "Expand deep research progress"
          }
        >
          <span className="deep-research-inline-chevron">›</span>
        </button>

        <div className="deep-research-inline-main">
          <div className="deep-research-inline-header">
            <div>
              <div className="deep-research-inline-kicker">Deep Research</div>
              <h3>{state.run.title}</h3>
            </div>
            <span className={`deep-research-inline-status ${statusClass(state.run.status)}`}>
              {statusLabel(state.run.status)}
            </span>
          </div>

          <div className="deep-research-inline-meta">
            <span>
              {derived.completedStepCount}/{state.steps.length || 0} steps done
            </span>
            <span>{derived.acceptedSources.length} valid sources</span>
            {derived.excludedSources.length > 0 && (
              <span>{derived.excludedSources.length} excluded sources</span>
            )}
            {derived.activeStep && <span>Current: {derived.activeStep.title}</span>}
          </div>

          <div className="deep-research-inline-progress">
            <div className="deep-research-inline-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <button className="deep-research-inline-open-btn" onClick={onOpenPanel}>
          Open Full Panel
        </button>
      </div>

      {expanded && (
        <div className="deep-research-inline-body">
          <div className="deep-research-inline-section">
            <div className="deep-research-inline-section-title">Plan</div>
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
                {derived.reportPreview ? "Report Preview" : "Latest Finding"}
              </div>
              <p className="deep-research-inline-preview">{latestText}</p>
            </div>
          )}

          <div className="deep-research-inline-grid">
            <div className="deep-research-inline-section">
              <div className="deep-research-inline-section-title">Recent Valid Sources</div>
              {recentAcceptedSources.length > 0 ? (
                <div className="deep-research-inline-sources">
                  {recentAcceptedSources.map((source) => (
                    <a
                      key={source.id}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="deep-research-inline-source"
                    >
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
                <p className="deep-research-inline-empty">Gathering sources…</p>
              )}
            </div>

            {derived.excludedSources.length > 0 && (
              <div className="deep-research-inline-section">
                <div className="deep-research-inline-section-title">Excluded Sources</div>
                <div className="deep-research-inline-excluded">
                  {derived.excludedSources.slice(0, 3).map((source) => (
                    <div key={source.id} className="deep-research-inline-excluded-item">
                      <span>{source.title}</span>
                      <span>
                        {source.excludeReason ?? source.note ?? "Duplicate or low-relevance source"}
                      </span>
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
