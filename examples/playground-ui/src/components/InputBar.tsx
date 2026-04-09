/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
}
import type { SlashCommandMeta } from "../api";

export interface PendingAttachment {
  name: string;
  base64: string;
  mimeType: string;
  size: number;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void;
  slashCommands?: SlashCommandMeta[];
  mode: "chat" | "deep_research";
  onModeChange: (mode: "chat" | "deep_research") => void;
  disabled: boolean;
  notConfigured?: boolean;
  attachments?: PendingAttachment[];
  onFilesSelected?: (files: File[]) => void;
  onRemoveAttachment?: (index: number) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function InputBar({
  value,
  onChange,
  onSend,
  slashCommands = [],
  mode,
  onModeChange,
  disabled,
  notConfigured = false,
  attachments = [],
  onFilesSelected,
  onRemoveAttachment,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  useEffect(() => {
    if (mode !== "deep_research") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();

    const particles: Particle[] = [];
    let frame = 0;
    let animId: number;

    const spawn = () => {
      particles.push({
        x: Math.random() * canvas.width,
        y: canvas.height + 4,
        vx: (Math.random() - 0.5) * 0.6,
        vy: -(Math.random() * 0.7 + 0.25),
        radius: Math.random() * 1.8 + 0.4,
        life: 0,
        maxLife: 70 + Math.random() * 70,
      });
    };

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (frame % 5 === 0) spawn();
      frame++;

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!;
        p.life++;
        p.x += p.vx;
        p.y += p.vy;

        const t = p.life / p.maxLife;
        const alpha = t < 0.2 ? t / 0.2 : t > 0.75 ? (1 - t) / 0.25 : 1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(14,165,233,${(alpha * 0.55).toFixed(3)})`;
        ctx.fill();

        if (p.life >= p.maxLife) particles.splice(i, 1);
      }
      animId = requestAnimationFrame(tick);
    };

    tick();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [mode]);

  const canSend = value.trim().length > 0 || attachments.length > 0;
  const trimmedValue = value.trim();

  const slashSuggestions = useMemo(() => {
    if (!trimmedValue.startsWith("/")) return [];
    const query = trimmedValue.toLowerCase();
    const matches = slashCommands.filter((command) => command.name.toLowerCase().startsWith(query));
    if (matches.some((command) => command.name.toLowerCase() === query)) return [];
    return matches;
  }, [slashCommands, trimmedValue]);

  const exactSlashCommand = useMemo(() => {
    const normalized = trimmedValue.toLowerCase();
    return (
      slashCommands.find((command) => {
        const name = command.name.toLowerCase();
        return normalized === name || normalized.startsWith(`${name} `);
      }) ?? null
    );
  }, [slashCommands, trimmedValue]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [trimmedValue]);

  useEffect(() => {
    if (highlightedIndex < slashSuggestions.length) return;
    setHighlightedIndex(0);
  }, [highlightedIndex, slashSuggestions.length]);

  const applySuggestion = useCallback(
    (command: SlashCommandMeta) => {
      if (!command.available) return;
      onChange(`${command.name} `);
      ref.current?.focus();
    },
    [onChange],
  );

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % slashSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex(
          (prev) => (prev - 1 + slashSuggestions.length) % slashSuggestions.length,
        );
        return;
      }
      if (e.key === "Tab") {
        const command = slashSuggestions[highlightedIndex] ?? slashSuggestions[0]!;
        if (!command.available) return;
        e.preventDefault();
        applySuggestion(command);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend(value);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.add("drag-over");
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove("drag-over");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.classList.remove("drag-over");
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFilesSelected?.(files);
    },
    [onFilesSelected],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) onFilesSelected?.(files);
      e.target.value = "";
    },
    [onFilesSelected],
  );

  return (
    <div
      className={`input-bar ${mode === "deep_research" ? "deep-research-mode" : "chat-mode"}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {mode === "deep_research" && (
        <canvas ref={canvasRef} className="input-bar-particles" aria-hidden="true" />
      )}
      <div className={`input-mode-switch ${mode === "deep_research" ? "deep-research" : "chat"}`}>
        <button
          className={`input-mode-btn ${mode === "chat" ? "active" : ""}`}
          type="button"
          onClick={() => onModeChange("chat")}
        >
          Chat
        </button>
        <button
          className={`input-mode-btn ${mode === "deep_research" ? "active" : ""}`}
          type="button"
          onClick={() => onModeChange("deep_research")}
        >
          Deep Research
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".xlsx,.xls,.docx,.txt,.md,.csv"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {attachments.length > 0 && (
        <div className="attachment-chips-bar">
          {attachments.map((att, i) => (
            <div key={i} className="attachment-chip">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="chip-name">{att.name}</span>
              <span className="chip-size">{formatSize(att.size)}</span>
              <button
                className="chip-remove"
                onClick={() => onRemoveAttachment?.(i)}
                aria-label={`Remove ${att.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {exactSlashCommand && (
        <div className="slash-command-badge-row">
          <span className={`slash-command-badge ${exactSlashCommand.available ? "" : "disabled"}`}>
            {exactSlashCommand.name}
          </span>
          <span className="slash-command-badge-meta">
            {exactSlashCommand.available
              ? exactSlashCommand.description
              : (exactSlashCommand.unavailableReason ?? exactSlashCommand.description)}
          </span>
        </div>
      )}

      <div className={`input-row ${mode === "deep_research" ? "deep-research-row" : "chat-row"}`}>
        <button
          className={`attach-btn ${mode === "deep_research" ? "deep-research-action" : ""}`}
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach file"
          title="Attach file (.xlsx, .docx, .txt, .md)"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <textarea
          ref={ref}
          className={`input-textarea ${mode === "deep_research" ? "deep-research-textarea" : ""}`}
          placeholder={
            notConfigured
              ? "Click the ⚙️ settings icon in the top-right to set your Tenant ID and User ID…"
              : mode === "deep_research"
                ? "Enter a research topic, question, or analysis task… (Shift+Enter for new line)"
                : "Ask the agent anything… (Shift+Enter for new line)"
          }
          value={value}
          rows={1}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
        />
        <button
          className={`send-btn ${disabled ? "loading" : ""} ${
            mode === "deep_research" ? "deep-research-action" : ""
          }`}
          disabled={disabled || !canSend}
          onClick={() => onSend(value)}
          aria-label="Send"
        >
          {disabled ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="28"
                strokeDashoffset="0"
              >
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 12 12"
                  to="360 12 12"
                  dur="0.8s"
                  repeatCount="indefinite"
                />
              </circle>
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          )}
        </button>
      </div>

      {slashSuggestions.length > 0 && (
        <div className="slash-command-menu" role="listbox" aria-label="Slash commands">
          {slashSuggestions.map((command, index) => (
            <button
              key={command.name}
              type="button"
              className={`slash-command-item ${index === highlightedIndex ? "active" : ""} ${
                command.available ? "" : "disabled"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(command);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <span className="slash-command-name">{command.name}</span>
              <span className="slash-command-desc">
                {command.available
                  ? command.description
                  : (command.unavailableReason ?? command.description)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
