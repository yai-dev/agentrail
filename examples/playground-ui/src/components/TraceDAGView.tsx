/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useMemo, useState } from "react";
import type {
  AgentRunTrace,
  LlmTurnStep,
  ToolCallStep,
  TraceStep,
  WorkflowTraceEventEnvelope,
} from "../types/trace";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState";

// ─── Design tokens (matched to WS dark theme) ────────────────────────────────

const C = {
  bg: "#0d1117",
  surface: "#161b22",
  surfaceHi: "#1c2333",
  border: "rgba(255,255,255,0.08)",
  borderHi: "rgba(255,255,255,0.14)",
  text: "#c9d1d9",
  muted: "#6e7681",
  accent: "#0ea5e9",
  purple: "#a78bfa",
  green: "#6ee7b7",
  red: "#fca5a5",
  yellow: "#fcd34d",
  line: "rgba(255,255,255,0.12)",
} as const;

// ─── Layout model ────────────────────────────────────────────────────────────

type LayoutRow =
  | { kind: "llm"; step: LlmTurnStep }
  | { kind: "tools"; steps: ToolCallStep[] }
  | { kind: "skill_section"; skillName: string; hostToolId: string; rows: LayoutRow[] };

function buildLayout(steps: TraceStep[], source: "main" | "skill" = "main"): LayoutRow[] {
  const filtered = steps.filter((s) => s.source === source);
  const rows: LayoutRow[] = [];
  let i = 0;

  while (i < filtered.length) {
    const step = filtered[i]!;

    if (step.kind === "llm") {
      rows.push({ kind: "llm", step: step as LlmTurnStep });
      i++;
      continue;
    }

    if (step.kind === "tool") {
      const toolStep = step as ToolCallStep;

      if (toolStep.toolName === "Skill") {
        const skillName = (toolStep.args as { skillName?: string } | null)?.skillName ?? "skill";
        const skillSteps = steps.filter((s) => s.source === "skill" && s.skillName === skillName);
        rows.push({
          kind: "skill_section",
          skillName,
          hostToolId: toolStep.id,
          rows: buildLayout(skillSteps, "skill"),
        });
        i++;
        continue;
      }

      // Group parallel calls with the same parentLlmId
      const group: ToolCallStep[] = [toolStep];
      i++;
      while (i < filtered.length) {
        const next = filtered[i]!;
        if (next.kind === "tool" && (next as ToolCallStep).parentLlmId === toolStep.parentLlmId) {
          group.push(next as ToolCallStep);
          i++;
        } else {
          break;
        }
      }
      rows.push({ kind: "tools", steps: group });
      continue;
    }

    i++;
  }

  return rows;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(start: number, end?: number): string {
  if (!end) return "—";
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatOffset(base: number, time: number): string {
  const ms = time - base;
  if (ms < 1000) return `+${ms}ms`;
  return `+${(ms / 1000).toFixed(1)}s`;
}

function toolIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("bash") || n.includes("shell")) return "⚡";
  if (n.includes("read")) return "📄";
  if (n.includes("write")) return "✏️";
  if (n.includes("edit")) return "🔧";
  if (n.includes("grep") || n.includes("search")) return "🔍";
  if (n.includes("browser")) return "🌐";
  if (n.includes("skill")) return "⚙️";
  if (n.includes("kb") || n.includes("knowledge")) return "📚";
  if (n.includes("todo")) return "✅";
  if (n.includes("ask") || n.includes("question")) return "❓";
  return "🔩";
}

function statusDotColor(status: "running" | "done" | "error"): string {
  if (status === "running") return C.accent;
  if (status === "error") return C.red;
  return C.green;
}

function truncate(s: string, max = 52): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}

function argSummary(args: unknown, toolName: string): string | undefined {
  const a = args as Record<string, unknown> | null;
  if (!a) return undefined;
  const n = toolName.toLowerCase();
  if (n.includes("bash") || n.includes("shell")) {
    return typeof a.command === "string" ? truncate(a.command, 40) : undefined;
  }
  if (n.includes("read") || n.includes("write") || n.includes("edit") || n.includes("grep")) {
    const p = a.path ?? a.file_path ?? a.pattern;
    return typeof p === "string" ? truncate(p.split("/").pop() ?? p, 40) : undefined;
  }
  if (n.includes("skill")) {
    return typeof a.skillName === "string" ? a.skillName : undefined;
  }
  return undefined;
}

function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function extractResultSummary(result: unknown): string {
  if (result === null || result === undefined) return "—";
  if (typeof result === "string") return truncate(result, 100);
  if (Array.isArray(result)) {
    const first = result[0];
    if (typeof first === "object" && first && "text" in first)
      return truncate(String((first as { text: unknown }).text), 100);
    return `[${result.length} items]`;
  }
  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.content === "string") return truncate(r.content, 100);
    if (typeof r.text === "string") return truncate(r.text, 100);
  }
  return truncate(JSON.stringify(result), 100);
}

// ─── Connector ───────────────────────────────────────────────────────────────

function VLine({ height = 18 }: { height?: number }) {
  return (
    <div
      style={{
        width: "1px",
        height,
        background: `linear-gradient(to bottom, ${C.line}, ${C.border})`,
        flexShrink: 0,
        alignSelf: "center",
      }}
    />
  );
}

function HBar({ width }: { width: number }) {
  return (
    <div
      style={{
        height: "1px",
        width,
        background: C.line,
        flexShrink: 0,
      }}
    />
  );
}

// ─── Nodes ───────────────────────────────────────────────────────────────────

interface LlmNodeProps {
  step: LlmTurnStep;
  selected: boolean;
  traceStart: number;
  onClick: () => void;
}

function LlmNode({ step, selected, traceStart, onClick }: LlmNodeProps) {
  const color = statusDotColor(step.status);
  const dur = formatDuration(step.startTime, step.endTime);
  const offset = formatOffset(traceStart, step.startTime);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <button
        onClick={onClick}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          padding: "9px 14px 9px 12px",
          borderRadius: "8px",
          border: `1px solid ${selected ? C.purple : C.borderHi}`,
          borderLeft: `3px solid ${selected ? C.purple : "rgba(167,139,250,0.4)"}`,
          background: selected
            ? "linear-gradient(135deg, rgba(167,139,250,0.12), rgba(167,139,250,0.04))"
            : `linear-gradient(135deg, ${C.surfaceHi}, ${C.surface})`,
          cursor: "pointer",
          textAlign: "left",
          minWidth: "150px",
          outline: "none",
          transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
          boxShadow: selected ? `0 0 0 1px rgba(167,139,250,0.2)` : "none",
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "8px",
            right: "9px",
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
            ...(step.status === "running"
              ? { animation: "status-running-pulse 1.55s ease-in-out infinite" }
              : {}),
          }}
        />
        <span
          style={{
            fontSize: "12px",
            fontWeight: 700,
            color: selected ? C.purple : C.text,
            display: "flex",
            alignItems: "center",
            gap: "5px",
            paddingRight: "16px",
          }}
        >
          🤖
          <span>Turn {step.index + 1}</span>
          {step.source === "skill" && (
            <span style={{ fontSize: "9px", color: C.muted, fontWeight: 500 }}>(sub)</span>
          )}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {step.stopReason && (
            <span style={{ fontSize: "10px", color: C.muted }}>stop: {step.stopReason}</span>
          )}
          <span
            style={{ fontSize: "11px", fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}
          >
            {dur}
          </span>
        </span>
      </button>
      <span
        style={{
          fontSize: "10px",
          color: C.muted,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {offset}
      </span>
    </div>
  );
}

interface ToolNodeProps {
  step: ToolCallStep;
  selected: boolean;
  onClick: () => void;
}

function ToolNode({ step, selected, onClick }: ToolNodeProps) {
  const color = statusDotColor(step.status);
  const dur = formatDuration(step.startTime, step.endTime);
  const sub = argSummary(step.args, step.toolName);

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "3px",
        padding: "7px 12px 7px 10px",
        borderRadius: "7px",
        border: `1px solid ${selected ? C.accent : C.border}`,
        borderLeft: `3px solid ${selected ? C.accent : "rgba(14,165,233,0.35)"}`,
        background: selected
          ? "linear-gradient(135deg, rgba(14,165,233,0.12), rgba(14,165,233,0.04))"
          : `linear-gradient(135deg, ${C.surfaceHi}, ${C.surface})`,
        cursor: "pointer",
        textAlign: "left",
        minWidth: "90px",
        maxWidth: "180px",
        outline: "none",
        transition: "border-color 0.15s, background 0.15s",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "7px",
          right: "8px",
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: color,
          ...(step.status === "running"
            ? { animation: "status-running-pulse 1.55s ease-in-out infinite" }
            : {}),
        }}
      />
      <span
        style={{
          fontSize: "11px",
          fontWeight: 600,
          color: selected ? C.accent : C.text,
          display: "flex",
          alignItems: "center",
          gap: "4px",
          paddingRight: "14px",
        }}
      >
        <span>{toolIcon(step.toolName)}</span>
        <span>{step.toolName}</span>
      </span>
      {sub && (
        <span
          style={{
            fontSize: "9.5px",
            color: C.muted,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "150px",
          }}
        >
          {sub}
        </span>
      )}
      <span
        style={{
          fontSize: "10px",
          fontWeight: 600,
          color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {dur}
      </span>
    </button>
  );
}

// ─── Row renderer ─────────────────────────────────────────────────────────────

interface RowRendererProps {
  rows: LayoutRow[];
  traceStart: number;
  selectedId: string | null;
  onSelect: (step: TraceStep) => void;
  depth?: number;
}

function RowRenderer({ rows, traceStart, selectedId, onSelect, depth = 0 }: RowRendererProps) {
  const [collapsedSkills, setCollapsedSkills] = useState<Record<string, boolean>>({});

  const toggleSkill = (key: string) => setCollapsedSkills((p) => ({ ...p, [key]: !p[key] }));

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      {rows.map((row, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === rows.length - 1;

        if (row.kind === "llm") {
          return (
            <div
              key={row.step.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: "100%",
              }}
            >
              {!isFirst && <VLine />}
              <LlmNode
                step={row.step}
                selected={selectedId === row.step.id}
                traceStart={traceStart}
                onClick={() => onSelect(row.step)}
              />
              {!isLast && <VLine />}
            </div>
          );
        }

        if (row.kind === "tools") {
          const multi = row.steps.length > 1;
          const barW = Math.min(row.steps.length * 150, 460);
          return (
            <div
              key={row.steps.map((s) => s.id).join(",")}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: "100%",
              }}
            >
              <VLine height={12} />
              {multi && <HBar width={barW} />}
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  gap: "8px",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                {row.steps.map((step) => (
                  <ToolNode
                    key={step.id}
                    step={step}
                    selected={selectedId === step.id}
                    onClick={() => onSelect(step)}
                  />
                ))}
              </div>
              {multi && <HBar width={barW} />}
              <VLine height={12} />
            </div>
          );
        }

        if (row.kind === "skill_section") {
          const collapsed = collapsedSkills[row.hostToolId] ?? false;
          return (
            <div
              key={row.hostToolId}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: "100%",
              }}
            >
              <VLine />
              <div
                style={{
                  border: `1px solid rgba(167,139,250,0.25)`,
                  borderRadius: "10px",
                  padding: "10px 14px 12px",
                  background:
                    "linear-gradient(135deg, rgba(167,139,250,0.06), rgba(139,92,246,0.03))",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0,
                  width: "min(460px, 96%)",
                }}
              >
                {/* skill header */}
                <button
                  onClick={() => toggleSkill(row.hostToolId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "rgba(167,139,250,0.85)",
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "0 0 collapsed ? 0 : 10px",
                    width: "100%",
                    justifyContent: "center",
                    letterSpacing: "0.04em",
                    paddingBottom: collapsed ? "0" : "10px",
                  }}
                >
                  <span style={{ opacity: 0.7 }}>⚙️</span>
                  <span>Skill / {row.skillName}</span>
                  <span style={{ marginLeft: "auto", fontSize: "9px", opacity: 0.6 }}>
                    {collapsed ? "▼ expand" : "▲ collapse"}
                  </span>
                </button>

                {!collapsed &&
                  (row.rows.length > 0 ? (
                    <RowRenderer
                      rows={row.rows}
                      traceStart={traceStart}
                      selectedId={selectedId}
                      onSelect={onSelect}
                      depth={depth + 1}
                    />
                  ) : (
                    <span style={{ fontSize: "11px", color: C.muted }}>No sub-agent steps</span>
                  ))}
              </div>
              <VLine />
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "9.5px",
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: C.muted,
        marginBottom: "6px",
      }}
    >
      {children}
    </div>
  );
}

function CodeBlock({ text, maxHeight = 180 }: { text: string; maxHeight?: number }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 500;
  return (
    <div style={{ position: "relative" }}>
      <pre
        style={{
          fontSize: "11px",
          fontFamily: "var(--mono, monospace)",
          background: "rgba(0,0,0,0.35)",
          border: `1px solid ${C.border}`,
          borderRadius: "6px",
          padding: "10px 12px",
          margin: 0,
          overflowX: "auto",
          overflowY: "hidden",
          color: C.text,
          lineHeight: 1.55,
          maxHeight: expanded || !long ? "none" : maxHeight,
          transition: "max-height 0.2s ease",
        }}
      >
        {expanded || !long ? text : text.slice(0, 480) + "\n…"}
      </pre>
      {long && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            position: "absolute",
            bottom: "6px",
            right: "8px",
            fontSize: "10px",
            padding: "2px 7px",
            background: "rgba(14,165,233,0.15)",
            color: C.accent,
            border: `1px solid rgba(14,165,233,0.3)`,
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      )}
    </div>
  );
}

interface DetailPanelProps {
  step: TraceStep;
  traceStart: number;
}

function DetailPanel({ step, traceStart }: DetailPanelProps) {
  const dur = formatDuration(step.startTime, step.endTime);
  const offset = formatOffset(traceStart, step.startTime);
  const accentColor = step.kind === "llm" ? C.purple : C.accent;

  return (
    <div
      style={{
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "8px",
            background: `linear-gradient(135deg, rgba(${
              step.kind === "llm" ? "167,139,250" : "14,165,233"
            },0.2), rgba(${step.kind === "llm" ? "139,92,246" : "2,132,199"},0.1))`,
            border: `1px solid ${
              step.kind === "llm" ? "rgba(167,139,250,0.3)" : "rgba(14,165,233,0.3)"
            }`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "16px",
            flexShrink: 0,
          }}
        >
          {step.kind === "llm" ? "🤖" : toolIcon((step as ToolCallStep).toolName)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: accentColor }}>
            {step.kind === "llm"
              ? `Turn ${(step as LlmTurnStep).index + 1}`
              : (step as ToolCallStep).toolName}
          </div>
          <div style={{ fontSize: "10px", color: C.muted, marginTop: "1px" }}>
            {offset} &nbsp;·&nbsp; {dur}
          </div>
        </div>
        {step.kind === "tool" && (step as ToolCallStep).isError && (
          <span
            style={{
              fontSize: "9px",
              fontWeight: 700,
              padding: "2px 7px",
              background: "rgba(248,113,113,0.15)",
              color: C.red,
              border: `1px solid rgba(248,113,113,0.3)`,
              borderRadius: "4px",
            }}
          >
            ERROR
          </span>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: "1px", background: C.border }} />

      {/* LLM turn details */}
      {step.kind === "llm" && (
        <>
          <div>
            <SectionLabel>Status</SectionLabel>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: statusDotColor(step.status),
              }}
            >
              {step.status}
            </span>
          </div>
          {(step as LlmTurnStep).stopReason && (
            <div>
              <SectionLabel>Stop reason</SectionLabel>
              <span style={{ fontSize: "12px", color: C.text }}>
                {(step as LlmTurnStep).stopReason}
              </span>
            </div>
          )}
        </>
      )}

      {/* Tool call details */}
      {step.kind === "tool" && (
        <>
          <div>
            <SectionLabel>Args</SectionLabel>
            <CodeBlock text={prettyJson((step as ToolCallStep).args)} />
          </div>

          {(step as ToolCallStep).result !== undefined && (
            <div>
              <SectionLabel>Result</SectionLabel>
              <CodeBlock text={prettyJson((step as ToolCallStep).result)} maxHeight={220} />
              <div
                style={{
                  fontSize: "10px",
                  color: C.muted,
                  marginTop: "5px",
                  lineHeight: 1.4,
                  wordBreak: "break-all",
                }}
              >
                {extractResultSummary((step as ToolCallStep).result)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Raw JSON */}
      <div>
        <SectionLabel>Raw JSON</SectionLabel>
        <CodeBlock text={prettyJson(step)} maxHeight={160} />
      </div>
    </div>
  );
}

// ─── Agent Start / End markers ────────────────────────────────────────────────

function AgentMarker({
  label,
  status,
  extra,
}: {
  label: string;
  status: "running" | "done" | "error";
  extra?: string;
}) {
  const color = statusDotColor(status);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "5px 14px 5px 10px",
        borderRadius: "20px",
        border: `1px solid ${C.borderHi}`,
        background: C.surface,
      }}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          ...(status === "running"
            ? { animation: "status-running-pulse 1.55s ease-in-out infinite" }
            : {}),
        }}
      />
      <span style={{ fontSize: "11px", fontWeight: 600, color: C.text }}>{label}</span>
      {extra && <span style={{ fontSize: "10px", color: C.muted }}>{extra}</span>}
    </div>
  );
}

// ─── Filter bar ──────────────────────────────────────────────────────────────

type TraceFilter = "all" | "runtime" | "orchestration" | "waits" | "errors";

const FILTER_LABELS: { id: TraceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "runtime", label: "Runtime" },
  { id: "orchestration", label: "Orchestration" },
  { id: "waits", label: "Waits" },
  { id: "errors", label: "Errors" },
];

function filterEnvelopes(
  envelopes: WorkflowTraceEventEnvelope[],
  filter: TraceFilter,
): WorkflowTraceEventEnvelope[] {
  if (filter === "all") return envelopes;
  return envelopes.filter((e) => {
    const type = String(e.event.type ?? "");
    if (filter === "runtime") return e.source === "runtime";
    if (filter === "orchestration") return e.source === "orchestration";
    if (filter === "waits")
      return (
        type === "waiting_for_user_input" || type === "wait_registered" || type === "wait_resolved"
      );
    if (filter === "errors") return type === "error";
    return true;
  });
}

function FilterBar({
  active,
  onChange,
}: {
  active: TraceFilter;
  onChange: (f: TraceFilter) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "4px",
        padding: "6px 10px",
        overflowX: "auto",
        flexShrink: 0,
        borderBottom: `1px solid ${C.border}`,
        background: C.surface,
      }}
    >
      {FILTER_LABELS.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          style={{
            fontSize: "10px",
            padding: "2px 9px",
            borderRadius: "5px",
            border: `1px solid ${active === id ? "rgba(14,165,233,0.5)" : C.border}`,
            background: active === id ? "rgba(14,165,233,0.1)" : "transparent",
            color: active === id ? C.accent : C.muted,
            cursor: "pointer",
            whiteSpace: "nowrap",
            fontWeight: 600,
            transition: "all 0.12s",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TraceDAGViewProps {
  traces: AgentRunTrace[];
  /** Raw envelopes for filtering; when omitted all filter options still render */
  envelopes?: WorkflowTraceEventEnvelope[];
}

export function TraceDAGView({ traces, envelopes = [] }: TraceDAGViewProps) {
  const [selectedRunIdx, setSelectedRunIdx] = useState(0);
  const [selectedStep, setSelectedStep] = useState<TraceStep | null>(null);
  const [activeFilter, setActiveFilter] = useState<TraceFilter>("all");

  const filteredEnvelopes = useMemo(
    () => filterEnvelopes(envelopes, activeFilter),
    [envelopes, activeFilter],
  );

  // When traces are empty but envelopes exist (e.g. DeepResearch, which never
  // emits turn_*/tool_* so the DAG projection returns []), force-show all
  // envelopes so the user at least sees orchestration / subagent events.
  const forceEnvelopeList = traces.length === 0 && envelopes.length > 0;

  // When a filter is active and envelopes are available, build a filtered view.
  // For runtime filter we still use the projected traces; for other filters we
  // show a raw envelope list (no DAG projection needed).
  const showEnvelopeList =
    forceEnvelopeList ||
    (activeFilter !== "all" && activeFilter !== "runtime" && envelopes.length > 0);

  // When forced, show all envelopes (respecting the active filter if set).
  // Otherwise only show the filter-narrowed subset.
  const envelopesToShow = forceEnvelopeList
    ? activeFilter === "all"
      ? envelopes
      : filteredEnvelopes
    : filteredEnvelopes;

  const effectiveIdx = Math.min(selectedRunIdx, Math.max(0, traces.length - 1));
  const trace = traces[effectiveIdx] ?? null;

  const layout = useMemo(() => (trace ? buildLayout(trace.steps, "main") : []), [trace]);

  const handleSelectStep = (step: TraceStep) => {
    setSelectedStep((prev) => (prev?.id === step.id ? null : step));
  };

  // True empty: no traces AND no envelopes at all.
  if (traces.length === 0 && envelopes.length === 0) {
    return (
      <WorkspaceEmptyState
        icon="⬡"
        title="还没有行为跟踪数据"
        description="当智能体开始推理、调用工具或派生子流程后，这里会显示完整的行为轨迹。"
      />
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: C.bg,
      }}
    >
      {/* Filter bar */}
      <FilterBar
        active={activeFilter}
        onChange={(f) => {
          setActiveFilter(f);
          setSelectedStep(null);
        }}
      />

      {/* Envelope list for orchestration / waits / errors filters, or when
          the DAG projection is empty (e.g. DeepResearch with no turn_* events) */}
      {showEnvelopeList && <EnvelopeListView envelopes={envelopesToShow} />}

      {/* DAG view for all / runtime filters */}
      {!showEnvelopeList && (
        <>
          {/* Run selector */}
          {traces.length > 1 && (
            <div
              style={{
                display: "flex",
                gap: "4px",
                padding: "8px 10px",
                overflowX: "auto",
                flexShrink: 0,
                borderBottom: `1px solid ${C.border}`,
                background: C.surface,
              }}
            >
              {traces.map((t, idx) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedRunIdx(idx);
                    setSelectedStep(null);
                  }}
                  style={{
                    fontSize: "10px",
                    padding: "3px 10px",
                    borderRadius: "5px",
                    border: `1px solid ${effectiveIdx === idx ? "rgba(14,165,233,0.5)" : C.border}`,
                    background: effectiveIdx === idx ? "rgba(14,165,233,0.1)" : "transparent",
                    color: effectiveIdx === idx ? C.accent : C.muted,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    transition: "all 0.12s",
                  }}
                >
                  Run {idx + 1}
                  {t.status === "running" && (
                    <span style={{ color: C.accent, marginLeft: "4px" }}>●</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* DAG + Detail split */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {/* DAG column */}
            <div
              style={{
                flex: selectedStep ? "0 0 55%" : "1 1 100%",
                overflowY: "auto",
                overflowX: "hidden",
                padding: "20px 16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                borderRight: selectedStep ? `1px solid ${C.border}` : "none",
                gap: 0,
              }}
            >
              {trace && (
                <>
                  <AgentMarker
                    label="Agent Start"
                    status={trace.status === "running" ? "running" : "done"}
                  />
                  <VLine height={20} />

                  <RowRenderer
                    rows={layout}
                    traceStart={trace.startTime}
                    selectedId={selectedStep?.id ?? null}
                    onSelect={handleSelectStep}
                  />

                  {trace.endTime ? (
                    <>
                      <VLine height={20} />
                      <AgentMarker
                        label="Agent End"
                        status={trace.status}
                        extra={[
                          formatDuration(trace.startTime, trace.endTime),
                          trace.usage
                            ? `↑${(trace.usage.inputTokens / 1000).toFixed(1)}K ↓${(
                                trace.usage.outputTokens / 1000
                              ).toFixed(1)}K`
                            : undefined,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    </>
                  ) : (
                    <>
                      <VLine height={20} />
                      <AgentMarker label="Running…" status="running" />
                    </>
                  )}
                </>
              )}
            </div>

            {/* Detail panel */}
            {selectedStep && trace && (
              <div
                style={{
                  flex: "0 0 45%",
                  overflowY: "auto",
                  background: C.surface,
                  borderLeft: `1px solid ${C.border}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderBottom: `1px solid ${C.border}`,
                    background: C.surfaceHi,
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: C.muted,
                      textTransform: "uppercase",
                    }}
                  >
                    Details
                  </span>
                  <button
                    onClick={() => setSelectedStep(null)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: C.muted,
                      fontSize: "16px",
                      lineHeight: 1,
                      padding: "0 2px",
                      borderRadius: "3px",
                      transition: "color 0.12s",
                    }}
                  >
                    ×
                  </button>
                </div>
                <DetailPanel step={selectedStep} traceStart={trace.startTime} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Envelope list (orchestration / waits / errors filters) ───────────────────

function EnvelopeListView({ envelopes }: { envelopes: WorkflowTraceEventEnvelope[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  if (envelopes.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.muted,
          fontSize: "13px",
        }}
      >
        No events match this filter.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "10px" }}>
      {envelopes.map((env) => {
        const type = String(env.event.type ?? "");
        const isExpanded = expanded[env.id] ?? false;
        return (
          <div
            key={env.id}
            style={{
              marginBottom: "6px",
              border: `1px solid ${C.border}`,
              borderRadius: "7px",
              background: C.surface,
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => toggle(env.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "7px 10px",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: "4px",
                  flexShrink: 0,
                  background:
                    env.source === "orchestration"
                      ? "rgba(167,139,250,0.15)"
                      : "rgba(14,165,233,0.12)",
                  color: env.source === "orchestration" ? C.purple : C.accent,
                }}
              >
                {env.source}
              </span>
              <span style={{ fontSize: "11px", fontWeight: 600, color: C.text, flex: 1 }}>
                {type}
              </span>
              <span
                style={{
                  fontSize: "10px",
                  color: C.muted,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {new Date(env.timestamp).toLocaleTimeString()}
              </span>
              <span style={{ fontSize: "9px", color: C.muted }}>{isExpanded ? "▲" : "▼"}</span>
            </button>
            {isExpanded && (
              <div style={{ padding: "0 10px 10px" }}>
                <CodeBlock text={JSON.stringify(env.event, null, 2)} maxHeight={240} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
