/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { normalizeHistoryEvents } from "./hooks/orchestrationStateReducer.js";
import type { DeepResearchState, DeepResearchStreamEvent } from "./types/deepResearch.js";
import type {
  OrchestrationEvent,
  OrchestrationState,
  OrchestrationStreamEvent,
} from "./types/orchestration.js";
import type { WorkflowTraceEventEnvelope } from "./types/trace.js";

export interface UsageStat {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

type LlmEvent =
  | { type: "text_delta"; delta: string; contentIndex: number }
  | { type: "thinking_start"; contentIndex: number }
  | { type: "thinking_delta"; delta: string; contentIndex: number }
  | { type: "thinking_end"; content: string; contentIndex: number }
  | { type: string; [key: string]: unknown };

export interface ContextUsageStat {
  /** Total input tokens (non-cached + cacheRead + cacheWrite) = true context window size */
  inputTokens: number;
  outputTokens: number;
  /** Percentage of the 200K context window used (0–100) */
  budgetUsedPct: number;
}

export type StreamEvent =
  | { type: "session_id"; sessionId: string }
  | { type: "session.start" }
  | { type: "session.end"; usage: UsageStat }
  | { type: "context_usage"; inputTokens: number; outputTokens: number; budgetUsedPct: number }
  | { type: "context_compaction_start" }
  | { type: "context_compaction_end" }
  | { type: "turn.start" }
  | { type: "turn.complete"; message: { stopReason: string } }
  | { type: "message.start" }
  | { type: "message.end" }
  | { type: "message.update"; event: LlmEvent }
  | { type: "tool.before"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool.update"; toolCallId: string; toolName: string; partialResult: unknown }
  | {
      type: "tool.after";
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    }
  | {
      type: "waiting_for_user_input";
      toolCallId: string;
      question: string;
      hint?: string;
      options?: string[];
      multiple?: boolean;
      custom?: boolean;
    }
  | { type: "error"; error: { message: string } }
  | OrchestrationStreamEvent
  | DeepResearchStreamEvent
  | { type: string; [key: string]: unknown };

function storageGet(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors in non-browser or restricted contexts
  }
}

function storageRemove(key: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors in non-browser or restricted contexts
  }
}

let _tenantId: string = storageGet("tenantId") ?? "";
let _userId: string = storageGet("userId") ?? "";

export function setIdentity(tenantId: string, userId: string): void {
  _tenantId = tenantId;
  _userId = userId;
  storageSet("tenantId", tenantId);
  storageSet("userId", userId);
}

export function getIdentity(): { tenantId: string; userId: string } {
  return { tenantId: _tenantId, userId: _userId };
}

// ── Auth token ────────────────────────────────────────────────────────────
const AUTH_TOKEN_KEY = "agentrail-auth-token";
let _authToken: string = storageGet(AUTH_TOKEN_KEY) ?? "";

export function setAuthToken(token: string): void {
  _authToken = token;
  if (token) storageSet(AUTH_TOKEN_KEY, token);
  else storageRemove(AUTH_TOKEN_KEY);
}

export function getAuthToken(): string {
  return _authToken;
}

function authHeaders(): Record<string, string> {
  return _authToken ? { Authorization: `Bearer ${_authToken}` } : {};
}

function dispatchUnauthorized(): void {
  window.dispatchEvent(new Event("auth:unauthorized"));
}

export interface AttachmentPayload {
  name: string;
  base64: string;
  mimeType: string;
}

/**
 * Stream a chat message and yield RuntimeEvents as they arrive over SSE.
 * The first yielded event is always `session_id` (extracted from the
 * X-Session-Id response header), followed by the SSE event stream.
 */
export async function* streamChat(
  message: string,
  sessionId: string | null,
  signal?: AbortSignal,
  attachments?: AttachmentPayload[],
  mode: "chat" | "deep_research" = "chat",
): AsyncGenerator<StreamEvent> {
  let response: Response;
  try {
    response = await fetch("/api/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        message,
        tenantId: _tenantId,
        userId: _userId,
        mode,
        ...(sessionId ? { sessionId } : {}),
        ...(attachments?.length ? { attachments } : {}),
      }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    throw err;
  }

  if (!response.ok) {
    if (response.status === 401) {
      dispatchUnauthorized();
      return;
    }
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Server error ${response.status}: ${text}`);
  }

  // Yield the session ID as the first event so callers can persist it
  const sid = response.headers.get("X-Session-Id");
  if (sid) yield { type: "session_id", sessionId: sid };

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      try {
        yield JSON.parse(line.slice(6)) as StreamEvent;
      } catch {
        // skip malformed events
      }
    }
  }
}

export interface HistoryMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  usage?: UsageStat;
}

export interface CompactionMarker {
  id: string;
  type: "compaction_marker";
  compressedCount: number;
  timestamp: number;
  archiveId?: string | null;
}

export type HistoryItem = HistoryMessage | CompactionMarker;

export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}?tenantId=${encodeURIComponent(_tenantId)}`,
    { method: "DELETE", headers: authHeaders() },
  );
}

export async function respondToQuestion(sessionId: string, answer: string): Promise<boolean> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ answer }),
  });
  if (res.status === 401) {
    dispatchUnauthorized();
    return false;
  }
  return res.ok;
}

export interface SessionHistoryResult {
  messages: HistoryItem[];
  contextUsage: ContextUsageStat | null;
}

export async function fetchSessionMessages(
  sessionId: string,
  signal?: AbortSignal,
): Promise<SessionHistoryResult> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/messages?tenantId=${encodeURIComponent(
      _tenantId,
    )}`,
    { signal, headers: authHeaders() },
  );
  if (res.status === 401) {
    dispatchUnauthorized();
    return { messages: [], contextUsage: null };
  }
  if (!res.ok) return { messages: [], contextUsage: null };
  const data = (await res.json()) as {
    messages?: HistoryMessage[];
    contextUsage?: ContextUsageStat | null;
  };
  return {
    messages: data.messages ?? [],
    contextUsage: data.contextUsage ?? null,
  };
}

/** Fetches only the messages that were compressed in the last compaction. */
export async function fetchCompactedMessages(
  sessionId: string,
  archiveId?: string | null,
  signal?: AbortSignal,
): Promise<HistoryMessage[]> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(
      sessionId,
    )}/compacted-messages?tenantId=${encodeURIComponent(_tenantId)}${
      archiveId ? `&archiveId=${encodeURIComponent(archiveId)}` : ""
    }`,
    { signal, headers: authHeaders() },
  );
  if (res.status === 401) {
    dispatchUnauthorized();
    return [];
  }
  if (!res.ok) return [];
  return (await res.json()) as HistoryMessage[];
}

export interface CommandResult {
  command: string;
  status: "completed" | "queued" | "noop" | "error";
  message: string;
  sessionId?: string | null;
  details?: Record<string, unknown>;
}

export interface SlashCommandMeta {
  name: string;
  description: string;
  scope: "session" | "user";
  requiresSession: boolean;
  runsInBackground: boolean;
  writesConversationHistory: boolean;
  available: boolean;
  unavailableReason: string | null;
}

export async function fetchSlashCommands(sessionId: string | null): Promise<SlashCommandMeta[]> {
  const res = await fetch(
    `/api/commands${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`,
    { headers: authHeaders() },
  );
  if (res.status === 401) {
    dispatchUnauthorized();
    return [];
  }
  if (!res.ok) return [];
  const data = (await res.json()) as { commands?: SlashCommandMeta[] };
  return data.commands ?? [];
}

export async function runCommand(
  command: string,
  sessionId: string | null,
): Promise<CommandResult> {
  const res = await fetch("/api/commands", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      command,
      tenantId: _tenantId,
      userId: _userId,
      ...(sessionId ? { sessionId } : {}),
    }),
  });
  if (res.status === 401) {
    dispatchUnauthorized();
    return {
      command,
      status: "error",
      message: "Unauthorized",
      sessionId,
    };
  }
  return (await res.json()) as CommandResult;
}

// ── Knowledge Base API ────────────────────────────────────────────────────
// KB management

export async function fetchKBList(signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`/api/knowledge?tenantId=${encodeURIComponent(_tenantId)}`, {
    signal,
    headers: authHeaders(),
  });
  if (res.status === 401) {
    dispatchUnauthorized();
    return [];
  }
  if (!res.ok) return [];
  const data = (await res.json()) as { kbs?: string[] };
  return data.kbs ?? [];
}

export async function createKB(kbId: string): Promise<void> {
  await fetch(
    `/api/knowledge/${encodeURIComponent(kbId)}/init?tenantId=${encodeURIComponent(_tenantId)}`,
    { method: "POST", headers: authHeaders() },
  );
}

export async function deleteKB(kbId: string): Promise<void> {
  await fetch(
    `/api/knowledge/${encodeURIComponent(kbId)}?tenantId=${encodeURIComponent(_tenantId)}`,
    { method: "DELETE", headers: authHeaders() },
  );
}

export interface KBDocMeta {
  docId: string;
  title: string;
  status: "pending" | "processing" | "ready" | "failed";
  category: string[];
  topics: string[];
  summary: string | null;
  path: string;
  sizeTokensApprox: number;
  createdAt: number;
  updatedAt: number;
}

export type IngestionEvent =
  | { type: "job_created"; jobId: string; docId: string }
  | { type: "step_start"; step: string; message: string }
  | { type: "step_complete"; step: string }
  | { type: "step_error"; step: string; error: string }
  | { type: "job_complete"; meta: KBDocMeta }
  | { type: "job_failed"; error: string };

export async function* ingestDocument(
  kbId: string,
  title: string,
  content: string,
  signal?: AbortSignal,
): AsyncGenerator<IngestionEvent> {
  const res = await fetch(
    `/api/knowledge/${encodeURIComponent(kbId)}/documents/stream?tenantId=${encodeURIComponent(
      _tenantId,
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ title, content }),
      signal,
    },
  );

  if (!res.ok) {
    if (res.status === 401) {
      dispatchUnauthorized();
      return;
    }
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Server error ${res.status}: ${text}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      try {
        yield JSON.parse(line.slice(6)) as IngestionEvent;
      } catch {
        // skip malformed
      }
    }
  }
}

export async function fetchKBDocuments(kbId: string, signal?: AbortSignal): Promise<KBDocMeta[]> {
  const res = await fetch(
    `/api/knowledge/${encodeURIComponent(kbId)}/documents?tenantId=${encodeURIComponent(
      _tenantId,
    )}`,
    { signal, headers: authHeaders() },
  );
  if (res.status === 401) {
    dispatchUnauthorized();
    return [];
  }
  if (!res.ok) return [];
  const data = (await res.json()) as { documents?: KBDocMeta[] };
  return data.documents ?? [];
}

export async function deleteKBDocument(kbId: string, docId: string): Promise<void> {
  await fetch(
    `/api/knowledge/${encodeURIComponent(kbId)}/documents/${encodeURIComponent(
      docId,
    )}?tenantId=${encodeURIComponent(_tenantId)}`,
    { method: "DELETE", headers: authHeaders() },
  );
}

export async function searchKB(kbId: string, q: string, signal?: AbortSignal): Promise<unknown[]> {
  const res = await fetch(
    `/api/knowledge/${encodeURIComponent(kbId)}/search?tenantId=${encodeURIComponent(
      _tenantId,
    )}&q=${encodeURIComponent(q)}`,
    { signal, headers: authHeaders() },
  );
  if (res.status === 401) {
    dispatchUnauthorized();
    return [];
  }
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: unknown[] };
  return data.results ?? [];
}

/** List files in the sandbox workspace for a session. */
export async function fetchWorkspaceFiles(
  sessionId: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/workspace`, {
    signal,
    headers: authHeaders(),
  });
  if (res.status === 401) {
    dispatchUnauthorized();
    return [];
  }
  if (!res.ok) return [];
  const data = (await res.json()) as { files?: string[] };
  return data.files ?? [];
}

export interface WorkspaceFileResult {
  content: string;
  encoding?: "base64";
  mimeType?: string;
}

export async function fetchAuthorizedBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(url, { signal, headers: authHeaders() });
  if (res.status === 401) {
    dispatchUnauthorized();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch resource: ${res.status}`);
  }
  return await res.blob();
}

export async function fetchAuthorizedBlobUrl(url: string, signal?: AbortSignal): Promise<string> {
  const blob = await fetchAuthorizedBlob(url, signal);
  return URL.createObjectURL(blob);
}

export async function fetchAuthorizedDataUrl(url: string, signal?: AbortSignal): Promise<string> {
  const blob = await fetchAuthorizedBlob(url, signal);
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to convert blob to data URL"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

/** Read the content of a single file from the sandbox workspace. */
export async function fetchWorkspaceFile(
  sessionId: string,
  containerPath: string,
  signal?: AbortSignal,
): Promise<WorkspaceFileResult> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/workspace/file?path=${encodeURIComponent(
      containerPath,
    )}`,
    { signal, headers: authHeaders() },
  );
  if (res.status === 401) {
    dispatchUnauthorized();
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`Failed to read file: ${res.status}`);
  const data = (await res.json()) as {
    content?: string;
    error?: string;
    encoding?: "base64";
    mimeType?: string;
  };
  if (data.error) throw new Error(data.error);
  return { content: data.content ?? "", encoding: data.encoding, mimeType: data.mimeType };
}

/**
 * Fetch the browser screenshot for a session as a blob URL.
 * Uses authHeaders() so it works when UI_SECRET_TOKEN is configured.
 * Returns null when no screenshot is available (404) or on auth failure.
 */
export async function fetchBrowserScreenshot(
  sessionId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/browser/screenshot`, {
    signal,
    headers: authHeaders(),
  }).catch(() => null);
  if (!res) return null;
  if (res.status === 401) {
    dispatchUnauthorized();
    return null;
  }
  if (!res.ok) return null;
  const blob = await res.blob().catch(() => null);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

/** Extract a display string from a ToolResult (handles string or {content} shapes). */
export function extractResultText(result: unknown): string {
  if (typeof result === "string") return result;
  if (Array.isArray(result)) return result.map(extractResultText).join("\n");
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.content === "string") return r.content;
    if (typeof r.text === "string") return r.text;
  }
  return JSON.stringify(result, null, 2);
}

/**
 * Fetch the orchestration state for a session.
 * Returns null if the session has no orchestration data or on error.
 */
export async function fetchOrchestrationState(
  sessionId: string,
  signal?: AbortSignal,
): Promise<OrchestrationState | null> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/orchestration?tenantId=${encodeURIComponent(
      _tenantId,
    )}`,
    { signal, headers: authHeaders() },
  );
  if (res.status === 401) {
    dispatchUnauthorized();
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as {
    run?: OrchestrationState["run"];
    agents?: OrchestrationState["agents"];
    events?: OrchestrationEvent[];
    waits?: OrchestrationState["waits"];
    error?: string;
  };

  if (data.error) return null;

  return {
    run: data.run ?? null,
    agents: data.agents ?? [],
    events: normalizeHistoryEvents(data.events ?? []),
    waits: data.waits ?? [],
  };
}

export async function fetchSessionTrace(
  sessionId: string,
  signal?: AbortSignal,
): Promise<WorkflowTraceEventEnvelope[]> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/trace?tenantId=${encodeURIComponent(
      _tenantId,
    )}`,
    { signal, headers: authHeaders() },
  );
  if (res.status === 401) {
    dispatchUnauthorized();
    return [];
  }
  if (!res.ok) return [];
  const data = (await res.json()) as { events?: WorkflowTraceEventEnvelope[] };
  return data.events ?? [];
}

export async function fetchDeepResearchState(
  sessionId: string,
  signal?: AbortSignal,
): Promise<DeepResearchState | null> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/deep-research?tenantId=${encodeURIComponent(
      _tenantId,
    )}`,
    { signal, headers: authHeaders() },
  );
  if (res.status === 401) {
    dispatchUnauthorized();
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json()) as {
    state?: Omit<DeepResearchState, "events"> | null;
    events?: DeepResearchStreamEvent[];
  };
  if (!data.state) return null;
  return {
    ...data.state,
    events: data.events ?? [],
  };
}
