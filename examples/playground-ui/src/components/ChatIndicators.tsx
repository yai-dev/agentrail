/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { ContextUsageStat } from "../api";
import type { CompactionMarkerItem } from "../App";

export function CompactionBanner() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 14px",
        background: "var(--surface, #0f0f0f)",
        borderTop: "1px solid var(--border, #333)",
        fontSize: "12px",
        color: "var(--text-muted, #888)",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          border: "2px solid var(--text-muted, #888)",
          borderTopColor: "transparent",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <span>Optimizing context window&hellip;</span>
    </div>
  );
}

export function CompactionSeparator({
  item,
  onExpand,
}: {
  item: CompactionMarkerItem;
  onExpand: () => void;
}) {
  return (
    <div className="compaction-separator">
      <div className="compaction-separator-line" />
      <button
        className="compaction-separator-btn"
        onClick={item.loading ? undefined : onExpand}
        disabled={item.loading}
      >
        {item.loading ? (
          <>
            <span className="compaction-spinner" />
            Loading…
          </>
        ) : (
          <>
            ···&nbsp;
            {item.compressedCount > 0 ? `${item.compressedCount} messages` : "History"}
            compressed&nbsp;·&nbsp;click to expand
          </>
        )}
      </button>
      <div className="compaction-separator-line" />
    </div>
  );
}

export function ContextUsageIndicator({ usage }: { usage: ContextUsageStat }) {
  const pct = usage.budgetUsedPct;
  const color = pct >= 80 ? "#ef4444" : pct >= 50 ? "#f59e0b" : "#22c55e";
  const label = pct >= 80 ? "High" : pct >= 50 ? "Mid" : "Low";
  const tokK = (usage.inputTokens / 1000).toFixed(1);
  return (
    <span
      title={`Context: ${usage.inputTokens.toLocaleString()} input tokens (${pct}% of 200K window)`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "11px",
        color: "var(--text-muted, #888)",
        cursor: "default",
        userSelect: "none",
      }}
    >
      <span
        style={{
          width: "36px",
          height: "4px",
          borderRadius: "2px",
          background: "var(--border, #333)",
          overflow: "hidden",
          display: "inline-block",
        }}
      >
        <span
          style={{
            display: "block",
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: "2px",
            transition: "width 0.4s ease, background 0.4s ease",
          }}
        />
      </span>
      <span style={{ color, fontWeight: 500 }}>{label}</span>
      <span>{tokK}K</span>
    </span>
  );
}
