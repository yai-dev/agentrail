/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createKB,
  deleteKB,
  deleteKBDocument,
  fetchKBDocuments,
  fetchKBList,
  ingestDocument,
  type IngestionEvent,
  type KBDocMeta,
} from "../api";

// ── Ingestion step metadata ────────────────────────────────────────────────

const STEPS = ["analyze", "classify", "summarize", "index_update", "register"] as const;
type StepName = (typeof STEPS)[number];

const STEP_LABELS: Record<StepName, string> = {
  analyze: "Analyzing document structure",
  classify: "Classifying into knowledge tree",
  summarize: "Generating summary",
  index_update: "Updating topic index",
  register: "Registering document",
};

type StepStatus = "idle" | "running" | "done" | "error";

interface StepState {
  name: StepName;
  status: StepStatus;
  message?: string;
}

// ── Status icon helpers ────────────────────────────────────────────────────

function DocStatusBadge({ status }: { status: KBDocMeta["status"] }) {
  if (status === "ready")
    return (
      <span className="kb-doc-badge ready" title="Ready">
        ✓
      </span>
    );
  if (status === "processing" || status === "pending")
    return (
      <span className="kb-doc-badge pending" title="Processing">
        ⟳
      </span>
    );
  if (status === "failed")
    return (
      <span className="kb-doc-badge failed" title="Failed">
        ✕
      </span>
    );
  return null;
}

// ── KB selector view ───────────────────────────────────────────────────────

interface KBSelectorProps {
  onSelect: (kbId: string) => void;
}

function KBSelector({ onSelect }: KBSelectorProps) {
  const [kbs, setKbs] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingKb, setDeletingKb] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await fetchKBList();
    setKbs(list);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete knowledge base "${id}" and all its documents? This cannot be undone.`)) return;
    setDeletingKb(id);
    try {
      await deleteKB(id);
      setKbs((prev) => prev.filter((k) => k !== id));
    } finally {
      setDeletingKb(null);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    if (!/^[a-z0-9_-]+$/.test(name)) {
      setError("Only lowercase letters, numbers, - and _ are allowed.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createKB(name);
      setNewName("");
      setShowCreate(false);
      onSelect(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="kb-selector">
      <div className="kb-selector-header">
        <span className="kb-selector-title">Knowledge Bases</span>
        <button
          className="kb-selector-create-btn"
          onClick={() => {
            setShowCreate((v) => !v);
            setError(null);
          }}
          title="New knowledge base"
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
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {showCreate && (
        <div className="kb-create-form">
          <input
            className="kb-create-input"
            placeholder="Knowledge base name (e.g. product-docs)"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
            disabled={creating}
            autoFocus
          />
          {error && <div className="kb-create-error">{error}</div>}
          <div className="kb-create-actions">
            <button
              className="kb-add-submit"
              disabled={creating || !newName.trim()}
              onClick={() => void handleCreate()}
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              className="kb-add-cancel"
              onClick={() => {
                setShowCreate(false);
                setError(null);
                setNewName("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="kb-list">
        {kbs.length === 0 && !showCreate ? (
          <div className="kb-empty">No knowledge bases yet — click + to create one</div>
        ) : (
          kbs.map((id) => (
            <div key={id} className="kb-list-item-row">
              <button className="kb-list-item" onClick={() => onSelect(id)}>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0, opacity: 0.5 }}
                >
                  <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                </svg>
                <span className="kb-list-item-name">{id}</span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  style={{ flexShrink: 0, opacity: 0.35 }}
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
              <button
                className="kb-list-delete-btn"
                title="Delete knowledge base"
                disabled={deletingKb === id}
                onClick={(e) => void handleDelete(id, e)}
              >
                {deletingKb === id ? (
                  <span style={{ fontSize: 10 }}>…</span>
                ) : (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  </svg>
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Document list view ─────────────────────────────────────────────────────

interface DocListProps {
  kbId: string;
  onBack: () => void;
}

function DocList({ kbId, onBack }: DocListProps) {
  const [docs, setDocs] = useState<KBDocMeta[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addContent, setAddContent] = useState("");
  const [addFileName, setAddFileName] = useState<string | null>(null);
  const [isIngesting, setIsIngesting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [steps, setSteps] = useState<StepState[]>(STEPS.map((s) => ({ name: s, status: "idle" })));
  const [ingestingTitle, setIngestingTitle] = useState("");
  const [ingestError, setIngestError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadDocs = useCallback(async () => {
    const fetched = await fetchKBDocuments(kbId);
    setDocs(fetched);
  }, [kbId]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  const handleDelete = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteKBDocument(kbId, docId);
    setDocs((prev) => prev.filter((d) => d.docId !== docId));
  };

  const resetSteps = () => setSteps(STEPS.map((s) => ({ name: s, status: "idle" })));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAddFileName(file.name);
    if (!addTitle) {
      setAddTitle(file.name.replace(/\.md$/i, ""));
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAddContent((ev.target?.result as string) ?? "");
    };
    reader.readAsText(file, "utf-8");
  };

  const handleIngest = async () => {
    if (!addTitle.trim() || !addContent.trim() || isIngesting) return;

    setIsIngesting(true);
    setIngestError(null);
    setIngestingTitle(addTitle.trim());
    resetSteps();

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      for await (const event of ingestDocument(
        kbId,
        addTitle.trim(),
        addContent.trim(),
        abort.signal,
      )) {
        handleIngestionEvent(event);
        if (event.type === "job_complete") {
          setDocs((prev) => {
            const filtered = prev.filter((d) => d.docId !== event.meta.docId);
            return [...filtered, event.meta];
          });
          setAddTitle("");
          setAddContent("");
          setAddFileName(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
          setShowAddForm(false);
          break;
        }
        if (event.type === "job_failed") {
          setIngestError(event.error);
          break;
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setIngestError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsIngesting(false);
      abortRef.current = null;
    }
  };

  const handleIngestionEvent = (event: IngestionEvent) => {
    if (event.type === "step_start") {
      const step = event.step as StepName;
      setSteps((prev) =>
        prev.map((s) =>
          s.name === step
            ? { ...s, status: "running", message: event.message }
            : s.status === "running"
              ? { ...s, status: "done" }
              : s,
        ),
      );
    } else if (event.type === "step_complete") {
      const step = event.step as StepName;
      setSteps((prev) => prev.map((s) => (s.name === step ? { ...s, status: "done" } : s)));
    } else if (event.type === "step_error") {
      const step = event.step as StepName;
      setSteps((prev) =>
        prev.map((s) => (s.name === step ? { ...s, status: "error", message: event.error } : s)),
      );
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setShowAddForm(false);
    setIsIngesting(false);
    setAddTitle("");
    setAddContent("");
    setAddFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    resetSteps();
  };

  const filtered = docs.filter(
    (d) => !searchQ || d.title.toLowerCase().includes(searchQ.toLowerCase()),
  );

  return (
    <div className="kb-panel">
      {/* KB header with back button */}
      <div className="kb-doc-header">
        <button className="kb-back-btn" onClick={onBack} title="Back to knowledge base list">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="kb-doc-header-name">{kbId}</span>
      </div>

      {/* Search */}
      <div className="kb-search-row">
        <input
          className="kb-search"
          placeholder="Search documents…"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
        />
      </div>

      {/* Add document button */}
      {!showAddForm && !isIngesting && (
        <button className="kb-add-btn" onClick={() => setShowAddForm(true)}>
          <span className="kb-add-plus">+</span> Add Document
        </button>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="kb-add-form">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,text/markdown"
            style={{ display: "none" }}
            onChange={handleFileChange}
            disabled={isIngesting}
          />

          {/* File picker area */}
          <button
            className={`kb-file-pick-area ${addFileName ? "has-file" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            disabled={isIngesting}
            type="button"
          >
            {addFileName ? (
              <>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="kb-file-name">{addFileName}</span>
                <span className="kb-file-change">Change</span>
              </>
            ) : (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Select a .md file</span>
              </>
            )}
          </button>

          {/* Title (auto-filled, editable) */}
          <input
            className="kb-add-input"
            placeholder="Document title"
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            disabled={isIngesting}
          />

          <div className="kb-add-actions">
            <button
              className="kb-add-submit"
              disabled={isIngesting || !addTitle.trim() || !addContent.trim()}
              onClick={() => void handleIngest()}
            >
              {isIngesting ? "Processing…" : "Submit"}
            </button>
            <button className="kb-add-cancel" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Ingestion progress */}
      {isIngesting && (
        <div className="kb-progress">
          <div className="kb-progress-title">Processing: {ingestingTitle}</div>
          {steps.map((s) => (
            <div key={s.name} className={`kb-step kb-step-${s.status}`}>
              <span className="kb-step-icon">
                {s.status === "done"
                  ? "✓"
                  : s.status === "running"
                    ? "⟳"
                    : s.status === "error"
                      ? "✕"
                      : "·"}
              </span>
              <span className="kb-step-name">{s.name}</span>
              <span className="kb-step-label">
                {s.status === "running" ? (s.message ?? STEP_LABELS[s.name]) : STEP_LABELS[s.name]}
              </span>
            </div>
          ))}
          {ingestError && <div className="kb-error">{ingestError}</div>}
        </div>
      )}

      <div className="kb-divider" />

      {/* Document list */}
      <div className="kb-doc-list">
        {filtered.length === 0 ? (
          <div className="kb-empty">{docs.length === 0 ? "No documents yet" : "No results"}</div>
        ) : (
          filtered.map((doc) => (
            <div key={doc.docId} className="kb-doc-item">
              <DocStatusBadge status={doc.status} />
              <div className="kb-doc-info">
                <div className="kb-doc-title">{doc.title}</div>
                {doc.summary && <div className="kb-doc-summary">{doc.summary}</div>}
              </div>
              <button
                className="kb-doc-delete"
                title="Delete"
                onClick={(e) => void handleDelete(doc.docId, e)}
              >
                <svg
                  width="10"
                  height="10"
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
    </div>
  );
}

// ── Root component ─────────────────────────────────────────────────────────

export function KnowledgePanel() {
  const [selectedKb, setSelectedKb] = useState<string | null>(null);

  if (selectedKb) {
    return <DocList kbId={selectedKb} onBack={() => setSelectedKb(null)} />;
  }

  return <KBSelector onSelect={setSelectedKb} />;
}
