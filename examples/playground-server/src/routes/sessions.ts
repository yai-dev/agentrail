/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { config } from "@/config.js";
import { invalidateOrchestrationManager, sandboxManager } from "@/context/index.js";
import { waitHandleRegistry } from "@/wait-handle-registry.js";
import { isCompactionMessage, parseCompactionMetadata, SessionManager } from "@agentrail/app";
import type { Message } from "@agentrail/core";
import { Hono } from "hono";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const sessionManager = new SessionManager(config.dataDir);

const sessions = new Hono();

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
}

interface CompactionMarker {
  id: string;
  type: "compaction_marker";
  compressedCount: number;
  timestamp: number;
  archiveId?: string | null;
}

type DisplayItem = DisplayMessage | CompactionMarker;

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (b): b is { type: "text"; text: string } =>
        typeof b === "object" && b !== null && (b as { type: string }).type === "text",
    )
    .map((b) => b.text)
    .join("");
}

function extractThinking(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const parts = content
    .filter(
      (b): b is { type: "thinking"; thinking: string } =>
        typeof b === "object" && b !== null && (b as { type: string }).type === "thinking",
    )
    .map((b) => b.thinking)
    .join("\n");
  return parts.length > 0 ? parts : undefined;
}

function toDisplayMessage(m: Message, i: number): DisplayMessage | null {
  if (m.role !== "user" && m.role !== "assistant") return null;
  const text = extractText(m.content);
  if (m.role === "assistant") {
    const am = m as {
      role: "assistant";
      content: unknown;
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
      };
    };
    return {
      id: `msg-${i}`,
      role: "assistant",
      text,
      thinking: extractThinking(am.content),
      usage: am.usage
        ? {
            inputTokens: am.usage.inputTokens ?? 0,
            outputTokens: am.usage.outputTokens ?? 0,
            cacheReadTokens: am.usage.cacheReadTokens,
            cacheWriteTokens: am.usage.cacheWriteTokens,
          }
        : undefined,
    };
  }
  return { id: `msg-${i}`, role: "user", text };
}

/** GET /api/sessions/:sessionId/messages?tenantId=default */
sessions.get("/:sessionId/messages", async (c) => {
  const { sessionId } = c.req.param();
  const tenantId = c.req.query("tenantId") ?? "default";

  try {
    const [rawMessages, contextUsage] = await Promise.all([
      sessionManager.loadMessages(tenantId, sessionId, 200),
      sessionManager.getLastContextUsage(tenantId, sessionId),
    ]);

    const display: DisplayItem[] = rawMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .reduce<DisplayItem[]>((acc, m, i) => {
        // Convert compaction messages to markers instead of hiding them
        if (isCompactionMessage(m) && typeof m.content === "string") {
          const metadata = parseCompactionMetadata(m.content);
          const marker: CompactionMarker = {
            id: `compaction-${(m as { timestamp?: number }).timestamp ?? i}`,
            type: "compaction_marker",
            compressedCount: metadata.compressedCount,
            timestamp: (m as { timestamp?: number }).timestamp ?? 0,
            archiveId: metadata.archiveId,
          };
          acc.push(marker);
        } else {
          const dm = toDisplayMessage(m, i);
          if (dm) acc.push(dm);
        }
        return acc;
      }, []);

    // Merge consecutive assistant messages into one bubble (mirrors streaming behavior
    // where all turns are accumulated into a single assistant message in the UI).
    const merged: DisplayItem[] = [];
    for (const item of display) {
      const prev = merged[merged.length - 1];
      const isAssistant = !("type" in item) && (item as DisplayMessage).role === "assistant";
      const prevIsAssistant =
        prev !== undefined && !("type" in prev) && (prev as DisplayMessage).role === "assistant";
      if (isAssistant && prevIsAssistant) {
        const prevMsg = prev as DisplayMessage;
        const currMsg = item as DisplayMessage;
        const combinedText =
          prevMsg.text && currMsg.text
            ? `${prevMsg.text}\n${currMsg.text}`
            : prevMsg.text || currMsg.text;
        const combinedThinking =
          prevMsg.thinking && currMsg.thinking
            ? `${prevMsg.thinking}\n${currMsg.thinking}`
            : prevMsg.thinking || currMsg.thinking;
        merged[merged.length - 1] = {
          ...prevMsg,
          text: combinedText,
          thinking: combinedThinking,
          usage: currMsg.usage ?? prevMsg.usage,
        };
      } else {
        merged.push(item);
      }
    }

    return c.json({ messages: merged, contextUsage });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error }, 500);
  }
});

/** GET /api/sessions/:sessionId/compacted-messages?tenantId=default
 *  Returns only the messages that were actually compressed (first N from the bak file).
 */
sessions.get("/:sessionId/compacted-messages", async (c) => {
  const { sessionId } = c.req.param();
  const tenantId = c.req.query("tenantId") ?? "default";
  const archiveId = c.req.query("archiveId") ?? undefined;

  try {
    const bakMessages = await sessionManager.loadCompactedMessages(
      tenantId,
      sessionId,
      0,
      archiveId,
    );
    const display = bakMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .flatMap((m, i) => {
        const dm = toDisplayMessage(m, i);
        return dm ? [dm] : [];
      });

    return c.json(display);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error }, 500);
  }
});

sessions.post("/:sessionId/respond", async (c) => {
  const { sessionId } = c.req.param();

  let body: { kind?: unknown; answer?: unknown; decision?: unknown };
  try {
    body = await c.req.json<{ kind?: unknown; answer?: unknown; decision?: unknown }>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const pendingKind = waitHandleRegistry.getPendingKind(sessionId);

  // ── Permission approval ────────────────────────────────────────────────────
  if (body.kind === "permission" || pendingKind === "permission") {
    const { decision } = body;
    if (decision !== "approved" && decision !== "rejected") {
      return c.json(
        { error: "Field 'decision' must be \"approved\" or \"rejected\" for permission responses" },
        400,
      );
    }
    const resolved = waitHandleRegistry.respondPermission(sessionId, decision);
    if (!resolved) {
      return c.json({ error: `No pending permission request for session '${sessionId}'` }, 404);
    }
    return c.json({ ok: true });
  }

  // ── Question answer (AskUserQuestion tool) ─────────────────────────────────
  const { answer } = body;
  if (typeof answer !== "string" || answer.trim() === "") {
    return c.json({ error: "Field 'answer' is required and must be a non-empty string" }, 400);
  }

  const resolved = waitHandleRegistry.respond(sessionId, answer.trim());
  if (!resolved) {
    return c.json({ error: `No pending question for session '${sessionId}'` }, 404);
  }

  return c.json({ ok: true });
});

/** GET /api/sessions/:sessionId/workspace — list sandbox workspace files (up to 4 levels deep) */
sessions.get("/:sessionId/workspace", async (c) => {
  const { sessionId } = c.req.param();
  const workspaceDir = path.join(config.dataDir, "sandboxes", sessionId);

  const files: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 4) return;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        if (entry.name === "memo") continue;
        const full = path.join(dir, entry.name);
        const containerPath = "/workspace" + full.slice(workspaceDir.length);
        if (entry.isDirectory()) {
          await walk(full, depth + 1);
        } else {
          files.push(containerPath);
        }
      }
    } catch {
      // Directory may not exist yet; silently ignore
    }
  }

  await walk(workspaceDir, 0);
  return c.json({ files });
});

const BINARY_EXTENSIONS = new Set([
  ".xlsx",
  ".xls",
  ".docx",
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".zip",
  ".tar",
  ".gz",
  ".rar",
  ".7z",
]);

const MIME_MAP: Record<string, string> = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".rar": "application/x-rar-compressed",
  ".7z": "application/x-7z-compressed",
};

function getMimeType(ext: string): string {
  return MIME_MAP[ext] ?? "application/octet-stream";
}

/** GET /api/sessions/:sessionId/workspace/file?path=/workspace/... — read a single file */
sessions.get("/:sessionId/workspace/file", async (c) => {
  const { sessionId } = c.req.param();
  const containerPath = c.req.query("path") ?? "";

  if (!containerPath.startsWith("/workspace/")) {
    return c.json({ error: "Invalid path: must start with /workspace/" }, 400);
  }

  const rel = containerPath.slice("/workspace/".length);
  const workspaceDir = path.join(config.dataDir, "sandboxes", sessionId);
  const hostPath = path.resolve(workspaceDir, rel);

  if (!hostPath.startsWith(workspaceDir + path.sep) && hostPath !== workspaceDir) {
    return c.json({ error: "Path traversal not allowed" }, 400);
  }

  try {
    const ext = path.extname(hostPath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      const buf = await readFile(hostPath);
      return c.json({
        content: buf.toString("base64"),
        encoding: "base64",
        mimeType: getMimeType(ext),
      });
    }
    const content = await readFile(hostPath, "utf-8");
    return c.json({ content });
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

/** GET /api/sessions/:sessionId/browser/screenshot — proxy to browser-server /screenshot */
sessions.get("/:sessionId/browser/screenshot", async (c) => {
  const { sessionId } = c.req.param();

  try {
    const screenshotUrl = sandboxManager.getBrowserUrl(sessionId, "/screenshot");
    const res = await fetch(screenshotUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      return c.json({ error: `browser-server responded ${res.status}` }, 502);
    }
    const buffer = await res.arrayBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store, no-cache",
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error }, 502);
  }
});

/** DELETE /api/sessions/:sessionId?tenantId=default */
sessions.delete("/:sessionId", async (c) => {
  const { sessionId } = c.req.param();
  const tenantId = c.req.query("tenantId") ?? "default";

  try {
    // Destroy sandbox container and session data concurrently
    await Promise.all([
      sandboxManager.destroySandbox(sessionId),
      sessionManager.deleteSession(tenantId, sessionId),
    ]);
    invalidateOrchestrationManager(tenantId, sessionId);
    return c.json({ ok: true });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error }, 500);
  }
});

export { sessions };
