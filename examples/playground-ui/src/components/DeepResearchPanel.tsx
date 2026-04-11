/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchAuthorizedBlob, fetchWorkspaceFile, type WorkspaceFileResult } from "../api.js";
import type { DeepResearchArtifact, DeepResearchState } from "../types/deepResearch.js";
import { AuthenticatedMarkdownImage } from "./AuthenticatedMarkdownImage.js";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState.js";

interface Props {
  state: DeepResearchState | null;
  isLoading: boolean;
  sessionId?: string;
}

function formatTime(value?: string): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function artifactFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function stripMarkdownPreview(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[.*?\]\(.*?\)/g, " ")
    .replace(/\[([^\]]+)\]\((.*?)\)/g, "$1")
    .replace(/[*_>#|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDisplaySummary(text?: string): string {
  if (!text) return "";
  if (
    /^Based on my research/i.test(text) ||
    /```json/i.test(text) ||
    /"entityProfile"\s*:/i.test(text)
  ) {
    const fencedSummary = text.match(
      /"summary"\s*:\s*"([\s\S]+?)"\s*(?:,\s*"(?:entityProfile|sources|excludedSources)"|\})/,
    );
    if (fencedSummary?.[1]) {
      return fencedSummary[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").trim();
    }
  }
  return text.trim();
}

function truncatePreview(text: string, limit = 220): string {
  const preview = stripMarkdownPreview(text);
  if (preview.length <= limit) return preview;
  return `${preview.slice(0, limit).trimEnd()}...`;
}

function slugifyFileName(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "deep-research-report"
  );
}

function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  const copied = new Uint8Array(bytes.byteLength);
  copied.set(bytes);
  return copied.buffer;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0 ^ -1;
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index]!;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function createStoredZip(entries: Array<{ name: string; data: Uint8Array }>): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    (Math.floor(now.getSeconds() / 2) & 0x1f);
  const dosDate =
    (((now.getFullYear() - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0xf) << 5) |
    (now.getDate() & 0x1f);

  const writeU16 = (view: DataView, position: number, value: number) =>
    view.setUint16(position, value, true);
  const writeU32 = (view: DataView, position: number, value: number) =>
    view.setUint32(position, value, true);

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const entryCrc = crc32(entry.data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeU32(localView, 0, 0x04034b50);
    writeU16(localView, 4, 20);
    writeU16(localView, 6, 0);
    writeU16(localView, 8, 0);
    writeU16(localView, 10, dosTime);
    writeU16(localView, 12, dosDate);
    writeU32(localView, 14, entryCrc);
    writeU32(localView, 18, entry.data.length);
    writeU32(localView, 22, entry.data.length);
    writeU16(localView, 26, nameBytes.length);
    writeU16(localView, 28, 0);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeU32(centralView, 0, 0x02014b50);
    writeU16(centralView, 4, 20);
    writeU16(centralView, 6, 20);
    writeU16(centralView, 8, 0);
    writeU16(centralView, 10, 0);
    writeU16(centralView, 12, dosTime);
    writeU16(centralView, 14, dosDate);
    writeU32(centralView, 16, entryCrc);
    writeU32(centralView, 20, entry.data.length);
    writeU32(centralView, 24, entry.data.length);
    writeU16(centralView, 28, nameBytes.length);
    writeU16(centralView, 30, 0);
    writeU16(centralView, 32, 0);
    writeU16(centralView, 34, 0);
    writeU16(centralView, 36, 0);
    writeU32(centralView, 38, 0);
    writeU32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, entry.data);
    centralParts.push(centralHeader);
    offset += localHeader.length + entry.data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeU32(endView, 0, 0x06054b50);
  writeU16(endView, 4, 0);
  writeU16(endView, 6, 0);
  writeU16(endView, 8, entries.length);
  writeU16(endView, 10, entries.length);
  writeU32(endView, 12, centralSize);
  writeU32(endView, 16, offset);
  writeU16(endView, 20, 0);

  return new Blob([...localParts, ...centralParts, endRecord].map(toBlobPart), {
    type: "application/zip",
  });
}

function inferExtensionFromBlob(blob: Blob, fallback = "bin"): string {
  const mime = blob.type.toLowerCase();
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/svg+xml") return "svg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return fallback;
}

function buildLocalAssetName(
  reportUrl: string,
  artifactIndex: number,
  artifacts: DeepResearchArtifact[],
): string {
  try {
    const parsed = new URL(reportUrl, window.location.origin);
    const artifactId = parsed.searchParams.get("artifactId");
    const artifact = artifactId ? artifacts.find((item) => item.id === artifactId) : undefined;
    if (artifact) {
      return `assets/${artifactFileName(artifact.path)}`;
    }
  } catch {
    // Fall through to generic naming.
  }
  return `assets/report-image-${artifactIndex + 1}`;
}

function flowStatusLabel(status: "pending" | "running" | "completed" | "failed"): string {
  if (status === "running") return "In Progress";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return "Pending";
}

function SourceBadge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "success" | "info" | "warn" | "danger";
}) {
  return <span className={`deep-research-source-badge ${tone}`}>{children}</span>;
}

function TagGroup({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items: string[];
  tone?: "default" | "warn" | "info";
}) {
  if (items.length === 0) return null;
  const visible = items.slice(0, 8);
  const hiddenCount = Math.max(0, items.length - visible.length);

  return (
    <div className="deep-research-tag-group">
      <div className="deep-research-tag-group-title">{title}</div>
      <div className="deep-research-tag-list">
        {visible.map((item) => (
          <span key={`${title}-${item}`} className={`deep-research-tag ${tone}`}>
            {item}
          </span>
        ))}
        {hiddenCount > 0 && <span className="deep-research-tag more">+{hiddenCount}</span>}
      </div>
    </div>
  );
}

function SourceSection({
  title,
  sources,
  emptyText,
  excluded = false,
}: {
  title: string;
  sources: DeepResearchState["sources"];
  emptyText: string;
  excluded?: boolean;
}) {
  const [listExpanded, setListExpanded] = useState(false);
  const [expandedSourceIds, setExpandedSourceIds] = useState<string[]>([]);
  const visibleSources = listExpanded ? sources : sources.slice(0, 5);
  const remainingCount = Math.max(0, sources.length - visibleSources.length);

  return (
    <div className="deep-research-source-section">
      <div className="deep-research-source-section-header">
        <h5>{title}</h5>
        <div className="deep-research-source-section-header-actions">
          {sources.length > 5 && (
            <button
              type="button"
              className="deep-research-source-list-toggle"
              onClick={() => setListExpanded((value) => !value)}
            >
              {listExpanded ? "Collapse list" : `Show full list (+${sources.length - 5})`}
            </button>
          )}
          <span className="deep-research-stat-pill">{sources.length}</span>
        </div>
      </div>
      <div className="deep-research-sources">
        {visibleSources.map((source) => {
          const expanded = expandedSourceIds.includes(source.id);
          const detailText = excluded
            ? (source.excludeReason ?? source.note ?? "")
            : truncatePreview(source.snippet ?? source.note ?? "", 180);
          const canExpand = Boolean(detailText);

          return (
            <div
              key={source.id}
              className={`deep-research-source ${excluded ? "excluded" : ""} ${
                expanded ? "expanded" : ""
              }`}
            >
              <div className="deep-research-source-topline">
                <div className="deep-research-source-main">
                  <div className="deep-research-source-title-row">
                    <div className="deep-research-source-title">{source.title}</div>
                    {!excluded && source.tier && (
                      <SourceBadge tone={source.tier === "primary" ? "success" : "info"}>
                        {source.tier}
                      </SourceBadge>
                    )}
                  </div>
                  <div className="deep-research-source-meta-line">
                    <span className="deep-research-source-domain-chip">{source.domain}</span>
                    {source.confidence && (
                      <SourceBadge
                        tone={
                          source.confidence === "high_confidence"
                            ? "success"
                            : source.confidence === "medium_confidence"
                              ? "info"
                              : "warn"
                        }
                      >
                        {source.confidence}
                      </SourceBadge>
                    )}
                    {source.evidenceLevel && !excluded && (
                      <SourceBadge>{source.evidenceLevel}</SourceBadge>
                    )}
                    {source.fetchStatus && (
                      <SourceBadge
                        tone={
                          source.fetchStatus === "success"
                            ? "success"
                            : source.fetchStatus === "401" || source.fetchStatus === "403"
                              ? "warn"
                              : "default"
                        }
                      >
                        {source.fetchStatus}
                      </SourceBadge>
                    )}
                  </div>
                </div>
                <div className="deep-research-source-actions">
                  {!excluded && source.url && (
                    <a
                      className="deep-research-source-link"
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open source
                    </a>
                  )}
                  {canExpand && (
                    <button
                      type="button"
                      className="deep-research-source-toggle"
                      onClick={() =>
                        setExpandedSourceIds((prev) =>
                          prev.includes(source.id)
                            ? prev.filter((id) => id !== source.id)
                            : [...prev, source.id],
                        )
                      }
                    >
                      {expanded ? "Collapse" : "Expand details"}
                    </button>
                  )}
                </div>
              </div>
              {expanded && detailText && (
                <div className="deep-research-source-snippet">{detailText}</div>
              )}
            </div>
          );
        })}
        {sources.length === 0 && <p className="deep-research-empty-inline">{emptyText}</p>}
        {remainingCount > 0 && !listExpanded && (
          <p className="deep-research-empty-inline">
            {remainingCount} more sources — click “Show full list” above to view them.
          </p>
        )}
      </div>
    </div>
  );
}

function ArtifactPreview({
  sessionId,
  artifact,
}: {
  sessionId?: string;
  artifact: DeepResearchArtifact | null;
}) {
  // Artifacts are stored in the Deep Research workspace, so the preview fetches
  // the selected file lazily instead of loading every artifact payload up front.
  const [result, setResult] = useState<WorkspaceFileResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId || !artifact) {
      setResult(null);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    fetchWorkspaceFile(sessionId, artifact.path, ctrl.signal)
      .then((next) => setResult(next))
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [sessionId, artifact]);

  if (!artifact) {
    return <div className="deep-research-artifact-empty">Select an artifact to preview.</div>;
  }

  if (loading) {
    return <div className="deep-research-artifact-empty">Loading artifact preview…</div>;
  }

  if (!result) {
    return <div className="deep-research-artifact-empty">Cannot preview this artifact.</div>;
  }

  if (result.encoding === "base64" && result.mimeType?.startsWith("image/")) {
    return (
      <img
        className="deep-research-image-preview"
        src={`data:${result.mimeType};base64,${result.content}`}
        alt={artifact.title}
      />
    );
  }

  return <pre className="deep-research-artifact-preview">{result.content}</pre>;
}

const reportMarkdownComponents: Components = {
  img({ src, alt }) {
    return (
      <AuthenticatedMarkdownImage className="deep-research-report-image" src={src} alt={alt} />
    );
  },
};

export function DeepResearchPanel({ state, isLoading, sessionId }: Props) {
  // The side panel is the "full fidelity" view of a run. The inline card only
  // shows a compact summary, while this component exposes the whole state tree.
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [expandedStepIds, setExpandedStepIds] = useState<string[]>([]);
  const [reportExpanded, setReportExpanded] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const acceptedSources = useMemo(
    () => state?.sources.filter((source) => (source.status ?? "accepted") === "accepted") ?? [],
    [state?.sources],
  );
  const excludedSources = useMemo(
    () => state?.sources.filter((source) => source.status === "related_but_excluded") ?? [],
    [state?.sources],
  );
  const primarySources = useMemo(
    () => acceptedSources.filter((source) => source.tier === "primary"),
    [acceptedSources],
  );
  const supportingSources = useMemo(
    () => acceptedSources.filter((source) => source.tier !== "primary"),
    [acceptedSources],
  );
  const selectedArtifact = useMemo(
    () =>
      state?.artifacts.find((artifact) => artifact.id === selectedArtifactId) ??
      state?.artifacts[0] ??
      null,
    [state, selectedArtifactId],
  );
  const entityProfile = state?.entityProfile
    ? {
        mode: state.entityProfile.mode ?? "topic_scope",
        officialName: state.entityProfile.officialName,
        aliases: state.entityProfile.aliases ?? [],
        scopeTerms: state.entityProfile.scopeTerms ?? [],
        disambiguationNotes: state.entityProfile.disambiguationNotes ?? [],
        excludedEntities: state.entityProfile.excludedEntities ?? [],
        relatedEntities: state.entityProfile.relatedEntities ?? [],
      }
    : null;

  useEffect(() => {
    if (!state?.artifacts.length) {
      setSelectedArtifactId(null);
      return;
    }
    setSelectedArtifactId((prev) =>
      prev && state.artifacts.some((artifact) => artifact.id === prev)
        ? prev
        : (state.artifacts[0]?.id ?? null),
    );
  }, [state?.artifacts]);

  useEffect(() => {
    if (!state?.steps.length) {
      setExpandedStepIds([]);
      return;
    }
    const preferred = state.steps
      .filter((step) => step.status === "running" || step.status === "failed")
      .map((step) => step.id);
    const latestCompleted = [...state.steps].reverse().find((step) => step.status === "completed");
    setExpandedStepIds((prev) => {
      const next = new Set(prev);
      preferred.forEach((id) => next.add(id));
      if (latestCompleted) next.add(latestCompleted.id);
      return [...next];
    });
  }, [state?.steps]);

  useEffect(() => {
    if (!state?.steps.length) {
      setSelectedStepId(null);
      return;
    }
    setSelectedStepId((prev) =>
      prev && state.steps.some((step) => step.id === prev) ? prev : null,
    );
  }, [state?.steps]);

  useEffect(() => {
    if (!state?.reportMarkdown) {
      setReportExpanded(state?.run.status === "running");
      return;
    }
    setReportExpanded(state.run.status === "running");
  }, [state?.run.id, state?.run.status, state?.reportMarkdown]);

  if (isLoading) {
    return (
      <WorkspaceEmptyState
        icon="◌"
        title="Loading deep research"
        description="Restoring the research state, sources, and artifacts for this session. Please wait."
      />
    );
  }

  if (!state) {
    return (
      <WorkspaceEmptyState
        icon="◎"
        title="No deep research yet"
        description="No deep research has been started in this session. Switch to Deep Research mode in the input bar to begin a full investigation."
      />
    );
  }

  const reportPreview = state.reportMarkdown ? truncatePreview(state.reportMarkdown, 320) : "";
  const selectedStep = selectedStepId
    ? (state.steps.find((step) => step.id === selectedStepId) ?? null)
    : null;

  const handleDownloadReport = async () => {
    if (!state.reportMarkdown || downloadingReport) return;
    setDownloadingReport(true);
    const ctrl = new AbortController();
    let markdownForDownload = state.reportMarkdown;

    try {
      const imageMatches = Array.from(
        state.reportMarkdown.matchAll(/!\[[^\]]*]\((\/api\/[^)\s]+)(?:\s+"[^"]*")?\)/g),
      );
      const uniqueUrls = [...new Set(imageMatches.map((match) => match[1]).filter(Boolean))];

      const zipEntries: Array<{ name: string; data: Uint8Array }> = [];
      const usedNames = new Set<string>();

      const imageEntries = await Promise.all(
        uniqueUrls.map(async (url, index) => {
          try {
            const blob = await fetchAuthorizedBlob(url, ctrl.signal);
            let localName = buildLocalAssetName(url, index, state.artifacts);
            const extension = localName.includes(".")
              ? ""
              : `.${inferExtensionFromBlob(blob, "png")}`;
            localName = `${localName}${extension}`;
            while (usedNames.has(localName)) {
              localName = localName.replace(/(\.[^.]+)?$/, `-${index + 1}$1`);
            }
            usedNames.add(localName);
            return {
              originalUrl: url,
              localName,
              bytes: await blobToUint8Array(blob),
            };
          } catch {
            return null;
          }
        }),
      );

      for (const imageEntry of imageEntries) {
        if (!imageEntry) continue;
        markdownForDownload = markdownForDownload
          .split(imageEntry.originalUrl)
          .join(imageEntry.localName);
        zipEntries.push({ name: imageEntry.localName, data: imageEntry.bytes });
      }

      zipEntries.unshift({
        name: "report.md",
        data: new TextEncoder().encode(markdownForDownload),
      });

      const zipBlob = createStoredZip(zipEntries);
      const url = URL.createObjectURL(zipBlob);
      const anchor = document.createElement("a");
      const safeTitle = slugifyFileName(state.run.title);
      anchor.href = url;
      anchor.download = `${safeTitle}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    } finally {
      ctrl.abort();
      setDownloadingReport(false);
    }
  };

  return (
    <div className="deep-research-panel">
      <section className="deep-research-card">
        <div className="deep-research-run-header">
          <div>
            <h3>{state.run.title}</h3>
            <p>{state.run.query}</p>
          </div>
          <span className={`deep-research-status ${state.run.status}`}>
            {state.run.status === "running"
              ? "Running"
              : state.run.status === "completed"
                ? "Completed"
                : "Failed"}
          </span>
        </div>
        <div className="deep-research-meta">
          <span>Created {formatTime(state.run.createdAt)}</span>
          <span>Updated {formatTime(state.run.updatedAt)}</span>
        </div>
        <div className="deep-research-run-stats">
          <span className="deep-research-stat-pill">{state.steps.length} steps</span>
          <span className="deep-research-stat-pill">{acceptedSources.length} valid sources</span>
          <span className="deep-research-stat-pill">{state.artifacts.length} artifacts</span>
        </div>
        {entityProfile && (
          <div className="deep-research-entity">
            <div className="deep-research-entity-name">
              {entityProfile.officialName ?? state.run.title}
            </div>
            <div className="deep-research-entity-row">
              <span className="deep-research-stat-pill">
                Mode:{" "}
                {entityProfile.mode === "entity_disambiguation"
                  ? "Entity Disambiguation"
                  : "Topic Scope"}
              </span>
              {state.entityProfile?.confidence && (
                <span className="deep-research-stat-pill">
                  Confidence: {state.entityProfile?.confidence}
                </span>
              )}
              {state.entityProfile?.source && (
                <span className="deep-research-stat-pill">
                  Source: {state.entityProfile?.source}
                </span>
              )}
            </div>
            <TagGroup title="Aliases" items={entityProfile.aliases} />
            <TagGroup title="Scope Terms" items={entityProfile.scopeTerms} tone="info" />
            <TagGroup
              title="Excluded Namesakes"
              items={entityProfile.excludedEntities}
              tone="warn"
            />
            <TagGroup title="Related Entities" items={entityProfile.relatedEntities} />
          </div>
        )}
      </section>

      <section className="deep-research-card">
        <h4>Plan</h4>
        <div className="deep-research-plan-flow" aria-label="Research plan flow">
          {state.steps.map((step, index) => (
            <div key={`flow-${step.id}`} className="deep-research-plan-flow-item">
              <button
                type="button"
                className={`deep-research-plan-flow-node ${step.status} ${
                  selectedStepId === step.id ? "selected" : ""
                }`}
                onClick={() => setSelectedStepId(step.id)}
                aria-pressed={selectedStepId === step.id}
              >
                <span className="deep-research-plan-flow-index">{index + 1}</span>
                <span className="deep-research-plan-flow-content">
                  <span className="deep-research-plan-flow-kicker">
                    Step {index + 1} · {step.type}
                  </span>
                  <span className="deep-research-plan-flow-label">{step.title}</span>
                </span>
                <span className={`deep-research-plan-flow-state ${step.status}`}>
                  {flowStatusLabel(step.status)}
                </span>
              </button>
              {index < state.steps.length - 1 && (
                <div className="deep-research-plan-flow-arrow" aria-hidden="true">
                  →
                </div>
              )}
            </div>
          ))}
        </div>
        {state.plan?.thought && <p className="deep-research-thought">{state.plan.thought}</p>}
        <div className="deep-research-steps">
          {!selectedStep && (
            <div className="deep-research-step-placeholder">
              Select a plan node above to inspect that step in detail.
            </div>
          )}
          {selectedStep &&
            (() => {
              const summary = extractDisplaySummary(selectedStep.summary);
              const preview = summary ? truncatePreview(summary) : "";
              const expanded = expandedStepIds.includes(selectedStep.id);

              return (
                <div
                  key={selectedStep.id}
                  className={`deep-research-step ${selectedStep.status} selected`}
                >
                  <div className="deep-research-step-top">
                    <span className="deep-research-step-index">#{selectedStep.index + 1}</span>
                    <span className="deep-research-step-type">{selectedStep.type}</span>
                    <span className="deep-research-step-status">{selectedStep.status}</span>
                  </div>
                  <div className="deep-research-step-title">{selectedStep.title}</div>
                  <div className="deep-research-step-desc">{selectedStep.description}</div>
                  <div className="deep-research-step-meta-row">
                    {selectedStep.digest && (
                      <span className="deep-research-stat-pill">
                        {selectedStep.digest.findings.length} findings /{" "}
                        {selectedStep.digest.openQuestions.length} questions /{" "}
                        {selectedStep.digest.confidence}
                      </span>
                    )}
                    {selectedStep.profileUpdateReason && (
                      <span className="deep-research-stat-pill">Profile updated</span>
                    )}
                  </div>
                  {preview && <div className="deep-research-step-preview">{preview}</div>}
                  {(summary || selectedStep.error) && (
                    <button
                      className="deep-research-step-toggle"
                      onClick={() =>
                        setExpandedStepIds((prev) =>
                          prev.includes(selectedStep.id)
                            ? prev.filter((id) => id !== selectedStep.id)
                            : [...prev, selectedStep.id],
                        )
                      }
                    >
                      {expanded ? "Hide Details" : "View Details"}
                    </button>
                  )}
                  {expanded && summary && (
                    <div className="deep-research-step-summary">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
                    </div>
                  )}
                  {expanded && selectedStep.profileUpdateReason && (
                    <div className="deep-research-step-error deep-research-step-note">
                      {selectedStep.profileUpdateReason}
                    </div>
                  )}
                  {selectedStep.error && (
                    <div className="deep-research-step-error">{selectedStep.error}</div>
                  )}
                </div>
              );
            })()}
        </div>
      </section>

      <section className="deep-research-card">
        <h4>Sources</h4>
        <div className="deep-research-source-groups">
          <SourceSection
            title="Primary Sources"
            sources={primarySources}
            emptyText="No primary sources yet."
          />
          <SourceSection
            title="Supporting Sources"
            sources={supportingSources}
            emptyText="No supporting sources yet."
          />
          {excludedSources.length > 0 && (
            <SourceSection
              title="Excluded Sources"
              sources={excludedSources}
              emptyText="No excluded sources."
              excluded
            />
          )}
        </div>
      </section>

      <section className="deep-research-card">
        <h4>Artifacts</h4>
        <div className="deep-research-artifacts-layout">
          <div className="deep-research-artifact-list">
            <div className="deep-research-artifact-list-header">
              <span className="deep-research-artifact-count">
                {state.artifacts.length} artifacts
              </span>
              {selectedArtifact && (
                <span className="deep-research-artifact-count">
                  Current: {selectedArtifact.title}
                </span>
              )}
            </div>
            {state.artifacts.map((artifact) => (
              <button
                key={artifact.id}
                className={`deep-research-artifact-item ${
                  selectedArtifact?.id === artifact.id ? "active" : ""
                }`}
                onClick={() => setSelectedArtifactId(artifact.id)}
              >
                <span className="deep-research-artifact-item-title">{artifact.title}</span>
                <span className="deep-research-artifact-item-meta">
                  {artifact.kind} · Step {artifact.stepId.split(":").pop()}
                </span>
                <span className="deep-research-artifact-item-meta">
                  {artifactFileName(artifact.path)}
                </span>
              </button>
            ))}
            {state.artifacts.length === 0 && (
              <p className="deep-research-empty-inline">No artifacts yet.</p>
            )}
          </div>
          <ArtifactPreview sessionId={sessionId} artifact={selectedArtifact} />
        </div>
      </section>

      <section className="deep-research-card">
        <div className="deep-research-section-header">
          <h4>Report</h4>
          <div className="deep-research-section-actions">
            <button
              className="deep-research-section-btn"
              onClick={() => setReportExpanded((value) => !value)}
            >
              {reportExpanded ? "Collapse" : "Expand"}
            </button>
            <button
              className="deep-research-section-btn primary"
              onClick={handleDownloadReport}
              disabled={!state.reportMarkdown || downloadingReport}
            >
              {downloadingReport ? "Bundling..." : "Download ZIP"}
            </button>
          </div>
        </div>
        {!reportExpanded && reportPreview && (
          <div className="deep-research-report-collapsed">
            <p className="deep-research-step-preview">{reportPreview}</p>
          </div>
        )}
        {reportExpanded && (
          <div className="deep-research-report">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={reportMarkdownComponents}>
              {state.reportMarkdown || "_Report generating..._"}
            </ReactMarkdown>
          </div>
        )}
      </section>
    </div>
  );
}
