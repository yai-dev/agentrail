/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DisplayToolCall, TurnActions } from "../App";
import {
  extractResultText,
  fetchBrowserScreenshot,
  fetchWorkspaceFile,
  fetchWorkspaceFiles,
  type WorkspaceFileResult,
} from "../api";
import type { AgentRunTrace, WorkflowTraceEventEnvelope } from "../types/trace";
import { AgentTeamPanel } from "./AgentTeamPanel";
import { DeepResearchPanel } from "./DeepResearchPanel";
import { TraceDAGView } from "./TraceDAGView";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState";
// mammoth imported dynamically inside DocxPreview

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type WorkspaceTab =
  | "activity"
  | "workspace"
  | "browser"
  | "trace"
  | "agent_team"
  | "deep_research";

interface ActiveFileView {
  path: string;
  content: string;
  type: "read" | "write" | "edit";
  oldStr?: string;
  newStr?: string;
}

interface TreeNode {
  name: string;
  fullPath: string;
  isDir: boolean;
  children: TreeNode[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}

function humanizeAction(toolName: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;

  switch (toolName) {
    case "Bash": {
      const cmd = String(a.command ?? "");
      if (cmd.includes("run_pipeline.sh")) return "Query database";
      if (cmd.includes("pip install") || cmd.includes("pip3 install")) return "Install dependencies";
      if (cmd.includes("python") || cmd.includes("python3")) return "Run script";
      if (cmd.includes("npm") || cmd.includes("pnpm")) return "Run build command";
      if (cmd.includes("git")) return "Run git operation";
      return "Run command";
    }
    case "Read": {
      const p = String(a.path ?? "");
      const fname = basename(p).toLowerCase();
      if (fname.includes("reference") || fname.includes("business-knowledge"))
        return "Read business knowledge base";
      if (fname.includes("skill.md") || fname.startsWith("skill")) return "Read skill definition";
      if (fname.includes("user.md")) return "Read user preferences";
      if (fname.includes("agentrail.yaml")) return "Read YAML config";
      if (fname.includes("todo")) return "View task list";
      if (fname.endsWith(".sql")) return "Read SQL query";
      if (fname.endsWith(".md")) return `Read ${basename(p)}`;
      if (fname.endsWith(".json")) return `Read config file`;
      return `Read file`;
    }
    case "Write": {
      const p = String(a.file_path ?? a.path ?? "");
      const fname = basename(p).toLowerCase();
      if (fname.endsWith(".sql")) return "Generate SQL query";
      if (fname.includes("todo")) return "Update task list";
      if (fname.endsWith(".md")) return `Write ${basename(p)}`;
      return `Write file`;
    }
    case "Edit": {
      const p = String(a.path ?? "");
      const fname = basename(p);
      return fname ? `Edit ${fname}` : "Edit file";
    }
    case "Grep":
      return "Search content";
    case "Skill": {
      const name = String(a.skillName ?? "");
      return name ? `Call skill: ${name}` : "Call skill";
    }
    case "KbList":
      return "Browse knowledge base";
    case "KbRead":
      return "Read knowledge base";
    case "KbSearch":
      return "Search knowledge base";
    case "TodoWrite":
      return "Record task progress";
    case "AskUserQuestion":
      return "Ask user";
    case "BrowserNavigate":
      return `Navigate to: ${String(a.url ?? "")}`;
    case "BrowserScroll":
      return "Scroll page";
    case "BrowserAction":
      return `Page action: ${String(a.type ?? "")}`;
    case "BrowserContent":
      return "Read page content";
    default:
      return toolName;
  }
}

function buildFileTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", fullPath: "/workspace", isDir: true, children: [] };

  for (const p of paths) {
    if (!p.startsWith("/workspace/")) continue;
    const parts = p.slice("/workspace/".length).split("/");
    let node = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isLast = i === parts.length - 1;
      const fullPath = "/workspace/" + parts.slice(0, i + 1).join("/");

      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, fullPath, isDir: !isLast, children: [] };
        node.children.push(child);
      }
      if (!isLast) node = child;
    }
  }

  return root.children;
}

function countBrowserCompletions(turns: TurnActions[]): number {
  const browserTools = new Set([
    "BrowserNavigate",
    "BrowserScroll",
    "BrowserAction",
    "BrowserContent",
  ]);
  return turns.reduce(
    (n, t) => n + t.toolCalls.filter((tc) => tc.done && browserTools.has(tc.name)).length,
    0,
  );
}

function countFileCompletions(turns: TurnActions[]): number {
  const fileTools = new Set(["Read", "Write", "Edit"]);
  return turns.reduce(
    (n, t) => n + t.toolCalls.filter((tc) => tc.done && fileTools.has(tc.name)).length,
    0,
  );
}

function extractActiveFileView(turns: TurnActions[]): ActiveFileView | null {
  for (let ti = turns.length - 1; ti >= 0; ti--) {
    const turn = turns[ti]!;
    for (let ci = turn.toolCalls.length - 1; ci >= 0; ci--) {
      const tc = turn.toolCalls[ci]!;
      if (!tc.done) continue;
      const a = (tc.args ?? {}) as Record<string, string>;

      if (tc.name === "Read") {
        const filePath = a.file_path ?? a.path ?? "";
        if (!filePath) continue;
        const content = extractResultText(tc.result);
        return { path: filePath, content, type: "read" };
      }
      if (tc.name === "Write") {
        const filePath = a.file_path ?? a.path ?? "";
        if (!filePath) continue;
        return { path: filePath, content: a.contents ?? "", type: "write" };
      }
      if (tc.name === "Edit") {
        const filePath = a.file_path ?? a.path ?? "";
        if (!filePath) continue;
        return {
          path: filePath,
          content: "",
          type: "edit",
          oldStr: a.old_string ?? "",
          newStr: a.new_string ?? "",
        };
      }
    }
  }
  return null;
}

function extractBrowserUrl(turns: TurnActions[]): string | null {
  for (let ti = turns.length - 1; ti >= 0; ti--) {
    const turn = turns[ti]!;
    for (let ci = turn.toolCalls.length - 1; ci >= 0; ci--) {
      const tc = turn.toolCalls[ci]!;
      if (tc.name === "BrowserNavigate" && tc.done) {
        const a = (tc.args ?? {}) as Record<string, string>;
        return a.url ?? null;
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// File Preview helpers
// ─────────────────────────────────────────────────────────────────────────────

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function parseCSV(content: string): string[][] {
  return content
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      const cols: string[] = [];
      let cur = "";
      let inQuote = false;
      for (const ch of line) {
        if (ch === '"') {
          inQuote = !inQuote;
        } else if (ch === "," && !inQuote) {
          cols.push(cur);
          cur = "";
        } else {
          cur += ch;
        }
      }
      cols.push(cur);
      return cols;
    });
}

const MAX_TABLE_ROWS = 1000;

function SpreadsheetTable({ rows }: { rows: string[][] }) {
  const header = rows[0] ?? [];
  const body = rows.slice(1, MAX_TABLE_ROWS + 1);
  const truncated = rows.length - 1 > MAX_TABLE_ROWS;
  return (
    <div className="ws-preview-table-wrap">
      <table className="ws-preview-table">
        {header.length > 0 && (
          <thead>
            <tr>
              {header.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <p className="ws-preview-truncated">
          Truncated: showing first {MAX_TABLE_ROWS} of {rows.length - 1} rows.
        </p>
      )}
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="ws-preview-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function CsvPreview({ content }: { content: string }) {
  const rows = useMemo(() => parseCSV(content), [content]);
  return <SpreadsheetTable rows={rows} />;
}

function XlsxPreview({ base64 }: { base64: string }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    import("xlsx")
      .then((XLSX) => {
        const wb = XLSX.read(base64, { type: "base64" });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
          setRows([]);
          return;
        }
        const ws = wb.Sheets[sheetName]!;
        const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
        setRows(data as string[][]);
      })
      .catch((e) => setError(String(e)));
  }, [base64]);

  if (error) return <p className="ws-preview-error">Parse error: {error}</p>;
  if (!rows) return <p className="ws-preview-loading">Parsing…</p>;
  if (rows.length === 0) return <p className="ws-preview-empty">(empty sheet)</p>;
  return <SpreadsheetTable rows={rows} />;
}

function DocxPreview({ base64 }: { base64: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("mammoth")
      .then((mammoth) => mammoth.extractRawText({ arrayBuffer: base64ToArrayBuffer(base64) }))
      .then((result) => {
        if (!cancelled) setText(result.value);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [base64]);

  if (error) return <p className="ws-preview-error">Parse error: {error}</p>;
  if (text === null) return <p className="ws-preview-loading">Parsing…</p>;
  return <pre className="ws-file-code ws-preview-docx-text">{text || "(empty document)"}</pre>;
}

function FilePreview({ filePath, result }: { filePath: string; result: WorkspaceFileResult }) {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

  if (result.encoding === "base64") {
    if (ext === "xlsx" || ext === "xls") return <XlsxPreview base64={result.content} />;
    if (ext === "docx") return <DocxPreview base64={result.content} />;
    if (result.mimeType?.startsWith("image/")) {
      return (
        <div className="ws-preview-image-wrap">
          <img
            src={`data:${result.mimeType};base64,${result.content}`}
            alt={basename(filePath)}
            className="ws-preview-image"
          />
        </div>
      );
    }
    if (ext === "pdf") {
      return (
        <div className="ws-preview-unavailable">
          <span>PDF preview is not supported. Ask the agent to extract the text content.</span>
        </div>
      );
    }
    return (
      <div className="ws-preview-unavailable">
        <span>Binary file — preview unavailable.</span>
      </div>
    );
  }

  if (ext === "md") return <MarkdownPreview content={result.content} />;
  if (ext === "csv") return <CsvPreview content={result.content} />;
  return <pre className="ws-file-code">{result.content || "(empty file)"}</pre>;
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusIcon
// ─────────────────────────────────────────────────────────────────────────────

function StatusIcon({
  done,
  isError,
  running,
}: {
  done: boolean;
  isError?: boolean;
  running: boolean;
}) {
  if (!done && running) {
    return <span className="ws-ai-status-dot running" />;
  }
  if (done && !isError) {
    return (
      <svg className="ws-ai-status-icon done" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M5 8l2 2 4-4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (done && isError) {
    return (
      <svg className="ws-ai-status-icon error" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M5.5 5.5l5 5M10.5 5.5l-5 5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return <span className="ws-ai-status-dot pending" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// ActivityItem
// ─────────────────────────────────────────────────────────────────────────────

const DETAIL_CHAR_LIMIT = 2000;

/** Renders a code block with optional truncation to avoid large DOM text nodes. */
function CodeBlock({ text, isError }: { text: string; isError?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = text.length > DETAIL_CHAR_LIMIT;
  const displayed = needsTruncation && !expanded ? text.slice(0, DETAIL_CHAR_LIMIT) : text;
  return (
    <>
      <pre className={`ws-code${isError ? " error" : ""}`}>{displayed}</pre>
      {needsTruncation && (
        <button className="ws-code-expand-btn" onClick={() => setExpanded((e) => !e)}>
          {expanded
            ? "▲ Collapse"
            : `▼ Expand ${(text.length - DETAIL_CHAR_LIMIT).toLocaleString()} more chars`}
        </button>
      )}
    </>
  );
}

interface ActivityItemProps {
  tool: DisplayToolCall;
  nested?: boolean;
  isLast?: boolean;
  children?: React.ReactNode;
}

function ActivityItem({ tool, nested = false, isLast = false, children }: ActivityItemProps) {
  const [open, setOpen] = useState(false);
  const running = !tool.done;
  const label = humanizeAction(tool.name, tool.args);

  const argsText = typeof tool.args === "string" ? tool.args : JSON.stringify(tool.args, null, 2);
  const resultText = tool.done ? extractResultText(tool.result) : "";

  return (
    <div className={`ws-ai-item${nested ? " nested" : ""}${isLast ? " last" : ""}`}>
      <div
        className={`ws-ai-item-row${running ? " running" : tool.isError ? " error" : " done"}`}
        onClick={() => setOpen((o) => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setOpen((o) => !o)}
      >
        <StatusIcon done={tool.done} isError={tool.isError} running={running} />
        <span className="ws-ai-item-label">{label}</span>
        {running && <span className="ws-ai-badge running">Running</span>}
        {tool.done && tool.isError && <span className="ws-ai-badge error">Failed</span>}
        <span className={`ws-ai-chevron${open ? " open" : ""}`}>›</span>
      </div>

      {open && (
        <div className="ws-ai-detail">
          <div className="ws-code-label">Input</div>
          <CodeBlock text={argsText} />
          {tool.done && (
            <>
              <div className="ws-code-label">Output</div>
              <CodeBlock text={resultText} isError={tool.isError} />
            </>
          )}
        </div>
      )}

      {/* Collapse nested tool calls with the skill group so the activity list stays scannable. */}
      {open && children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// groupTurns
// ─────────────────────────────────────────────────────────────────────────────

function groupTurns(turns: TurnActions[]): Array<{ main: TurnActions; skillTurns: TurnActions[] }> {
  const groups: Array<{ main: TurnActions; skillTurns: TurnActions[] }> = [];
  let current: { main: TurnActions; skillTurns: TurnActions[] } | null = null;

  for (const turn of turns) {
    if (turn.source === "main") {
      if (current) groups.push(current);
      current = { main: turn, skillTurns: [] };
    } else if (current) {
      current.skillTurns.push(turn);
    }
  }
  if (current) groups.push(current);
  return groups;
}

// ─────────────────────────────────────────────────────────────────────────────
// ActivityFeed
// ─────────────────────────────────────────────────────────────────────────────

interface ActivityFeedProps {
  main: TurnActions;
  skillTurns: TurnActions[];
}

function ActivityFeed({ main, skillTurns }: ActivityFeedProps) {
  const skillCallIndices = main.toolCalls
    .map((tc, i) => (tc.name === "Skill" ? i : -1))
    .filter((i) => i !== -1);
  const perSkillTurns: TurnActions[][] = skillCallIndices.map(() => []);
  skillTurns.forEach((st, i) => {
    const bucket = Math.min(i, perSkillTurns.length - 1);
    if (bucket >= 0) perSkillTurns[bucket]!.push(st);
  });

  let skillCallCount = 0;
  const items = main.toolCalls;

  return (
    <div className="ws-ai-feed">
      {items.map((tc, idx) => {
        const isLast = idx === items.length - 1;
        if (tc.name === "Skill") {
          const slotIdx = skillCallCount++;
          const nested = perSkillTurns[slotIdx] ?? [];
          const nestedCalls = nested.flatMap((st) => st.toolCalls);
          return (
            <ActivityItem key={tc.id} tool={tc} isLast={isLast && nestedCalls.length === 0}>
              {nestedCalls.length > 0 && (
                <div className="ws-ai-nested-list">
                  {nestedCalls.map((ntc, nidx) => (
                    <ActivityItem
                      key={ntc.id}
                      tool={ntc}
                      nested
                      isLast={nidx === nestedCalls.length - 1}
                    />
                  ))}
                </div>
              )}
            </ActivityItem>
          );
        }
        return <ActivityItem key={tc.id} tool={tc} isLast={isLast} />;
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LiveHeader
// ─────────────────────────────────────────────────────────────────────────────

function LiveHeader({ turns }: { turns: TurnActions[] }) {
  const activeTurns = turns.filter((t) => t.active);
  if (activeTurns.length === 0) return null;

  let currentLabel = "Thinking…";
  for (let i = activeTurns.length - 1; i >= 0; i--) {
    const turn = activeTurns[i]!;
    const running = turn.toolCalls.find((tc) => !tc.done);
    if (running) {
      currentLabel = humanizeAction(running.name, running.args) + "…";
      break;
    }
    if (turn.toolCalls.length === 0) {
      currentLabel = "Thinking…";
      break;
    }
  }

  return (
    <div className="ws-live-header">
      <span className="ws-live-dot" />
      <span className="ws-live-label">{currentLabel}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FileTreeNode — recursive tree renderer
// ─────────────────────────────────────────────────────────────────────────────

function FileTreeNode({
  node,
  depth,
  activePath,
  selectedPath,
  expandedDirs,
  onToggleDir,
  onSelectFile,
}: {
  node: TreeNode;
  depth: number;
  activePath?: string;
  selectedPath: string | null;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const isExpanded = expandedDirs.has(node.fullPath);
  const isActive = node.fullPath === activePath;
  const isSelected = node.fullPath === selectedPath;

  if (node.isDir) {
    return (
      <div className="ws-tree-dir">
        <div
          className="ws-tree-row ws-tree-dir-row"
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => onToggleDir(node.fullPath)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && onToggleDir(node.fullPath)}
        >
          <span className={`ws-tree-chevron${isExpanded ? " open" : ""}`}>›</span>
          <span className="ws-tree-dir-icon">📁</span>
          <span className="ws-tree-name">{node.name}</span>
        </div>
        {isExpanded &&
          node.children.map((child) => (
            <FileTreeNode
              key={child.fullPath}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              selectedPath={selectedPath}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
              onSelectFile={onSelectFile}
            />
          ))}
      </div>
    );
  }

  return (
    <div
      className={`ws-tree-row ws-tree-file-row${isActive ? " active" : ""}${
        isSelected ? " selected" : ""
      }`}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      onClick={() => onSelectFile(node.fullPath)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelectFile(node.fullPath)}
    >
      <span className="ws-tree-file-icon">📄</span>
      <span className="ws-tree-name">{node.name}</span>
      {isActive && <span className="ws-tree-active-badge">AI</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FileContentView — shows the content or diff of a file
// ─────────────────────────────────────────────────────────────────────────────

function FileContentView({ view }: { view: ActiveFileView }) {
  if (view.type === "edit") {
    return (
      <div className="ws-file-content">
        <div className="ws-file-diff">
          {view.oldStr && (
            <div className="ws-diff-section ws-diff-remove">
              <div className="ws-diff-label">Removed</div>
              <pre className="ws-diff-code ws-diff-old">{view.oldStr}</pre>
            </div>
          )}
          {view.newStr && (
            <div className="ws-diff-section ws-diff-add">
              <div className="ws-diff-label">Added</div>
              <pre className="ws-diff-code ws-diff-new">{view.newStr}</pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ws-file-content">
      <pre className="ws-file-code">{view.content || "(empty file)"}</pre>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WorkspaceFilesTab
// ─────────────────────────────────────────────────────────────────────────────

function WorkspaceFilesTab({ sessionId, turns }: { sessionId?: string; turns: TurnActions[] }) {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(["/workspace"]));
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loadedResult, setLoadedResult] = useState<WorkspaceFileResult | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const completedCount = turns.reduce((n, t) => n + t.toolCalls.filter((tc) => tc.done).length, 0);
  const activeFileView = extractActiveFileView(turns);
  const activePath = activeFileView?.path ?? null;

  // Auto-expand directories to make files visible:
  // 1. Expand all top-level directories when files are loaded.
  // 2. Expand the directory of the active file so it's immediately visible.
  useEffect(() => {
    if (files.length === 0) return;
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      for (const p of files) {
        if (!p.startsWith("/workspace/")) continue;
        const parts = p.slice("/workspace/".length).split("/");
        // Expand the top-level directory for every file
        if (parts.length > 1) {
          next.add("/workspace/" + parts[0]);
        }
        // Expand the immediate parent directory of the active file
        if (activePath && p === activePath && parts.length > 1) {
          const parentParts = parts.slice(0, -1);
          for (let i = 1; i <= parentParts.length; i++) {
            next.add("/workspace/" + parentParts.slice(0, i).join("/"));
          }
        }
      }
      return next;
    });
  }, [files, activePath]);

  const fetchFiles = useCallback(
    (ctrl?: AbortController) => {
      if (!sessionId) return;
      setLoading(true);
      fetchWorkspaceFiles(sessionId, ctrl?.signal)
        .then(setFiles)
        .catch(() => {})
        .finally(() => setLoading(false));
    },
    [sessionId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    fetchFiles(ctrl);
    return () => ctrl.abort();
  }, [fetchFiles, completedCount]);

  const handleSelectFile = async (filePath: string) => {
    setSelectedPath(filePath);
    setLoadedResult(null);
    if (!sessionId) return;
    setFileLoading(true);
    try {
      const result = await fetchWorkspaceFile(sessionId, filePath);
      setLoadedResult(result);
    } catch {
      setLoadedResult({ content: "(failed to read)" });
    } finally {
      setFileLoading(false);
    }
  };

  const handleToggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const tree = buildFileTree(files);

  const showSelectedFile = selectedPath !== null && (loadedResult !== null || fileLoading);
  const showActiveFile = !showSelectedFile && activeFileView !== null;

  if (!sessionId && !showSelectedFile && !showActiveFile) {
    return (
      <WorkspaceEmptyState
        icon="◌"
        title="Workspace not started"
        description="No workspace content is available yet. Start a session and files and artifacts will appear here."
      />
    );
  }

  if (loading && files.length === 0 && !showSelectedFile && !showActiveFile) {
    return (
      <WorkspaceEmptyState
        icon="◎"
        title="Loading workspace"
        description="Restoring the file tree and preview content for the current session. Please wait."
      />
    );
  }

  if (tree.length === 0 && !showSelectedFile && !showActiveFile) {
    return (
      <WorkspaceEmptyState
        icon="◇"
        title="Workspace is empty"
        description="No files have been generated yet. Once the agent reads, writes, or produces files, they will appear here automatically."
      />
    );
  }

  return (
    <div className="ws-tab-workspace">
      <div className="ws-file-tree">
        <div className="ws-tree-header">
          <span className="ws-tree-title">/workspace</span>
          <button className="ws-tree-refresh" onClick={() => fetchFiles()} title="Refresh file list">
            {loading ? "⟳" : "↻"}
          </button>
        </div>
        <div className="ws-tree-body">
          {!sessionId ? (
            <div className="ws-tree-empty">Waiting for session to start…</div>
          ) : loading && files.length === 0 ? (
            <div className="ws-tree-empty">Loading…</div>
          ) : tree.length === 0 ? (
            <div className="ws-tree-empty">No files in workspace</div>
          ) : (
            tree.map((node) => (
              <FileTreeNode
                key={node.fullPath}
                node={node}
                depth={0}
                activePath={activePath ?? undefined}
                selectedPath={selectedPath}
                expandedDirs={expandedDirs}
                onToggleDir={handleToggleDir}
                onSelectFile={handleSelectFile}
              />
            ))
          )}
        </div>
      </div>

      {showSelectedFile && (
        <div className="ws-file-viewer">
          <div className="ws-file-viewer-header">
            <span className="ws-file-viewer-path" title={selectedPath!}>
              {basename(selectedPath!)}
            </span>
            <span className="ws-file-viewer-type">Preview</span>
            {fileLoading && <span className="ws-file-viewer-loading">Loading…</span>}
          </div>
          <div className="ws-file-content ws-file-content-preview">
            {loadedResult && <FilePreview filePath={selectedPath!} result={loadedResult} />}
          </div>
        </div>
      )}

      {showActiveFile && (
        <div className="ws-file-viewer">
          <div className="ws-file-viewer-header">
            <span className="ws-file-viewer-path" title={activeFileView!.path}>
              {basename(activeFileView!.path)}
            </span>
            <span className="ws-file-viewer-type">
              {activeFileView!.type === "read"
                ? "Read"
                : activeFileView!.type === "write"
                  ? "Write"
                  : "Edit"}
            </span>
          </div>
          <FileContentView view={activeFileView!} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BrowserTab
// ─────────────────────────────────────────────────────────────────────────────

function BrowserTab({
  sessionId,
  turns,
  screenshotTs,
  onRefresh,
}: {
  sessionId?: string;
  turns: TurnActions[];
  screenshotTs: number;
  onRefresh: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const browserUrl = extractBrowserUrl(turns);
  const shouldFetch = !!(sessionId && screenshotTs > 0 && browserUrl);

  useEffect(() => {
    if (!shouldFetch || !sessionId) return;
    setImgError(false);
    setImgLoading(true);
    const ctrl = new AbortController();
    fetchBrowserScreenshot(sessionId, ctrl.signal).then((url) => {
      if (ctrl.signal.aborted) return;
      if (url) {
        setBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setImgLoading(false);
      } else {
        setImgError(true);
        setImgLoading(false);
      }
    });
    return () => ctrl.abort();
  }, [screenshotTs, shouldFetch, sessionId]);

  // Revoke blob URL on unmount
  useEffect(
    () => () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    },
    [blobUrl],
  );

  if (!sessionId || !browserUrl) {
    return (
      <WorkspaceEmptyState
        icon="◍"
        title="Browser not opened"
        description="When the agent uses the browser to visit a webpage, screenshots and the current URL will appear here."
      />
    );
  }

  return (
    <div className="ws-tab-browser">
      <div className="ws-browser-toolbar">
        {browserUrl ? (
          <span className="ws-browser-url" title={browserUrl}>
            {browserUrl}
          </span>
        ) : (
          <span className="ws-browser-url ws-browser-url-empty">Not navigated</span>
        )}
        <button className="ws-browser-refresh" onClick={onRefresh} title="Refresh screenshot">
          ↻
        </button>
      </div>

      <div className="ws-browser-viewport">
        {imgLoading && !imgError && (
          <div className="ws-browser-loading">
            <span className="ws-browser-spinner" />
            <span>Loading screenshot…</span>
          </div>
        )}
        {imgError ? (
          <div className="ws-browser-error">
            <span>Failed to load screenshot</span>
            <button className="ws-browser-retry" onClick={onRefresh}>
              Retry
            </button>
          </div>
        ) : (
          <img
            className="ws-browser-screenshot"
            src={blobUrl ?? undefined}
            alt="Agent browser screenshot"
            style={{ display: imgLoading || !blobUrl ? "none" : "block" }}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AgentWorkspace — top-level component
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  turns: TurnActions[];
  traces: AgentRunTrace[];
  envelopes?: WorkflowTraceEventEnvelope[];
  onClose: () => void;
  sessionId?: string;
  onWidthChange?: (width: number) => void;
  requestedTab?: WorkspaceTab | null;
  onRequestedTabHandled?: () => void;
  orchestrationState?: import("../types/orchestration").OrchestrationState | null;
  orchestrationLoading?: boolean;
  deepResearchState?: import("../types/deepResearch").DeepResearchState | null;
  deepResearchLoading?: boolean;
}

function AgentWorkspaceInner({
  turns,
  traces,
  envelopes,
  onClose,
  sessionId,
  onWidthChange,
  requestedTab,
  onRequestedTabHandled,
  orchestrationState,
  orchestrationLoading,
  deepResearchState,
  deepResearchLoading,
}: Props) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("activity");
  const [screenshotTs, setScreenshotTs] = useState<number>(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = panelRef.current?.getBoundingClientRect().width ?? 380;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX;
        const next = Math.max(320, Math.min(820, startWidth + delta));
        onWidthChange?.(next);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [onWidthChange],
  );

  const prevBrowserCountRef = useRef(0);
  const prevFileCountRef = useRef(0);

  const browserCount = useMemo(() => countBrowserCompletions(turns), [turns]);
  const fileCount = useMemo(() => countFileCompletions(turns), [turns]);
  const totalTools = useMemo(() => turns.reduce((n, t) => n + t.toolCalls.length, 0), [turns]);
  const isActive = useMemo(() => turns.some((t) => t.active), [turns]);
  const groups = useMemo(() => groupTurns(turns), [turns]);

  // Auto-switch tabs when new tool completions are detected
  useEffect(() => {
    if (browserCount > prevBrowserCountRef.current) {
      setActiveTab("browser");
      setScreenshotTs(Date.now());
      prevBrowserCountRef.current = browserCount;
    }
    if (fileCount > prevFileCountRef.current) {
      setActiveTab("workspace");
      prevFileCountRef.current = fileCount;
    }
  }, [browserCount, fileCount]);

  useEffect(() => {
    if (!requestedTab) return;
    setActiveTab(requestedTab);
    if (requestedTab === "browser" && browserCount > 0) {
      setScreenshotTs(Date.now());
    }
    onRequestedTabHandled?.();
  }, [browserCount, onRequestedTabHandled, requestedTab]);

  const handleTabClick = useCallback(
    (tab: WorkspaceTab) => {
      setActiveTab(tab);
      // Only refresh screenshot when clicking the browser tab if the AI has
      // already navigated somewhere (prevents fetching a blank-page screenshot).
      if (tab === "browser" && browserCount > 0) {
        setScreenshotTs(Date.now());
      }
    },
    [browserCount],
  );

  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: "activity", label: "Activity" },
    { id: "workspace", label: "Workspace" },
    { id: "browser", label: "Browser" },
    { id: "deep_research", label: "Deep Research" },
    { id: "agent_team", label: "Agent Team" },
    { id: "trace", label: "Trace" },
  ];

  return (
    <div className="workspace-panel" ref={panelRef}>
      <div className="workspace-resize-handle" onMouseDown={handleResizeMouseDown} />
      <div className="workspace-header">
        <span className="workspace-title">
          {isActive ? "Agent is working…" : "Agent Computer"}
          {totalTools > 0 && !isActive && <span className="workspace-count">{totalTools}</span>}
        </span>
        <button className="workspace-close-btn" onClick={onClose} title="Close">
          <svg
            width="14"
            height="14"
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

      {isActive && <LiveHeader turns={turns} />}

      <div className="ws-tab-bar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`ws-tab-btn${activeTab === tab.id ? " active" : ""}`}
            onClick={() => handleTabClick(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="workspace-body">
        {activeTab === "activity" &&
          (groups.length === 0 || totalTools === 0 ? (
            <WorkspaceEmptyState
              icon="⬡"
              title="No activity yet"
              description="Once the agent starts working, steps and tool calls will appear here in chronological order."
            />
          ) : (
            <div className="ws-ai-list">
              {groups.map(({ main, skillTurns }) => (
                <ActivityFeed key={main.turnIndex} main={main} skillTurns={skillTurns} />
              ))}
            </div>
          ))}

        {activeTab === "workspace" && <WorkspaceFilesTab sessionId={sessionId} turns={turns} />}

        {activeTab === "browser" && (
          <BrowserTab
            sessionId={sessionId}
            turns={turns}
            screenshotTs={screenshotTs}
            onRefresh={() => setScreenshotTs(Date.now())}
          />
        )}

        {activeTab === "deep_research" && (
          <DeepResearchPanel
            state={deepResearchState ?? null}
            isLoading={deepResearchLoading ?? false}
            sessionId={sessionId}
          />
        )}

        {activeTab === "agent_team" && (
          <AgentTeamPanel
            state={orchestrationState ?? null}
            isLoading={orchestrationLoading ?? false}
          />
        )}

        {activeTab === "trace" && <TraceDAGView traces={traces} envelopes={envelopes} />}
      </div>
    </div>
  );
}

export const AgentWorkspace = memo(AgentWorkspaceInner);
