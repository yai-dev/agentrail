/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteSession as deleteSessionApi,
  fetchCompactedMessages,
  fetchSessionMessages,
  fetchSlashCommands,
  runCommand,
  streamChat,
  type CompactionMarker,
  type ContextUsageStat,
  type HistoryItem,
  type SessionHistoryResult,
  type SlashCommandMeta,
  type UsageStat,
} from "./api";
import { AgentWorkspace, type WorkspaceTab } from "./components/AgentWorkspace";
import {
  CompactionBanner,
  CompactionSeparator,
  ContextUsageIndicator,
} from "./components/ChatIndicators";
import { DeepResearchRunCard } from "./components/DeepResearchRunCard";
import { InputBar, type PendingAttachment } from "./components/InputBar";
import { MessageBubble } from "./components/MessageBubble";
import { OnboardingTour, shouldShowTour } from "./components/OnboardingTour";
import { SessionSidebar } from "./components/SessionSidebar";
import { SettingsModal } from "./components/SettingsModal";
import { TokenGate } from "./components/TokenGate";
import {
  WaitingQuestionPrompt,
  type WaitingQuestionState,
} from "./components/WaitingQuestionPrompt";
import { useAuth } from "./hooks/useAuth";
import { useDeepResearchState } from "./hooks/useDeepResearchState";
import { useIdentity } from "./hooks/useIdentity";
import { useOrchestrationState } from "./hooks/useOrchestrationState";
import { useSessions } from "./hooks/useSessions";
import { useWorkflowTrace } from "./hooks/useWorkflowTrace";
import type { DeepResearchStreamEvent } from "./types/deepResearch";
import type { OrchestrationStreamEvent } from "./types/orchestration";

export interface DisplayToolCall {
  id: string;
  name: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  done: boolean;
}

export interface TurnActions {
  turnIndex: number;
  toolCalls: DisplayToolCall[];
  active: boolean;
  /** Whether this turn belongs to a skill sub-agent or the main agent */
  source: "main" | "skill";
  /** Name of the skill, set when source === "skill" */
  skillName?: string;
}

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  thinking?: string;
  usage?: UsageStat;
  streaming: boolean;
}

export interface CompactionMarkerItem {
  id: string;
  type: "compaction_marker";
  compressedCount: number;
  archiveId?: string | null;
  loading?: boolean;
}

export type MessageItem = DisplayMessage | CompactionMarkerItem;

function isCompactionMarkerItem(m: MessageItem): m is CompactionMarkerItem {
  return "type" in m && (m as CompactionMarkerItem).type === "compaction_marker";
}

export default function App() {
  const { identity, isConfigured, saveIdentity } = useIdentity();
  const { isAuthed, authReady, saveToken, clearToken } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [turns, setTurns] = useState<TurnActions[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [waitingQuestion, setWaitingQuestion] = useState<WaitingQuestionState | null>(null);
  const [questionInput, setQuestionInput] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [liveSkillActivity, setLiveSkillActivity] = useState<{
    skillName: string;
    toolName: string | null;
  } | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [workspaceWidth, setWorkspaceWidth] = useState(430);
  const [requestedWorkspaceTab, setRequestedWorkspaceTab] = useState<WorkspaceTab | null>(null);
  const closeWorkspace = useCallback(() => setWorkspaceOpen(false), []);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [contextUsage, setContextUsage] = useState<ContextUsageStat | null>(null);
  const [compacting, setCompacting] = useState(false);
  // Tracks the currently-executing skill name; a ref is used so callbacks read
  // the latest value without stale closures.
  // Sub-agent mode: set by skill_start, cleared by skill_end.
  // Direct execution mode: set after the Skill tool returns (no skill_start fires),
  // cleared on agent_end.
  const activeSkillRef = useRef<string | null>(null);
  // In direct execution mode, the Skill tool call completes before the main agent
  // starts executing the steps. We track the pending call here so we can activate
  // the skill indicator once the tool returns (absence of skill_start = direct mode).
  const pendingDirectSkillRef = useRef<{ toolCallId: string; skillName: string } | null>(null);

  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [inputMode, setInputMode] = useState<"chat" | "deep_research">("chat");
  const [slashCommands, setSlashCommands] = useState<SlashCommandMeta[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const turnIndexRef = useRef(0);
  // Buffer text/thinking deltas and flush as a single setState every 50 ms
  // to avoid triggering a full re-render on every individual character event.
  const pendingTextRef = useRef("");
  const pendingThinkingRef = useRef("");
  const deltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track message count so we only smooth-scroll on truly new messages.
  const lastMsgCountRef = useRef(0);
  // Set to true when sessionId is assigned mid-stream so the history-load
  // effect skips fetching (messages are already being built in real time).
  const skipHistoryLoadRef = useRef(false);

  const { sessions, upsert, remove } = useSessions();
  const {
    traces,
    envelopes: traceEnvelopes,
    feedEvent: feedTraceEvent,
    clearTrace,
  } = useWorkflowTrace(currentSessionId);
  const {
    state: orchestrationState,
    isLoading: orchestrationLoading,
    feedEvent: feedOrchestrationEvent,
    clearState: clearOrchestrationState,
  } = useOrchestrationState(currentSessionId);
  const {
    state: deepResearchState,
    derived: deepResearchDerived,
    isLoading: deepResearchLoading,
    feedEvent: feedDeepResearchEvent,
    clearState: clearDeepResearchState,
  } = useDeepResearchState(currentSessionId);

  const openDeepResearchWorkspace = useCallback(() => {
    setWorkspaceOpen(true);
    setRequestedWorkspaceTab("deep_research");
  }, []);

  // Listen for 401 responses anywhere in the app — clear token and return to gate
  useEffect(() => {
    const handler = () => clearToken();
    window.addEventListener("auth:unauthorized", handler);
    return () => window.removeEventListener("auth:unauthorized", handler);
  }, [clearToken]);

  // Show onboarding tour on first visit after the main UI is ready
  useEffect(() => {
    if (isConfigured && shouldShowTour()) {
      setTourActive(true);
    }
  }, [isConfigured]);

  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    fetchSlashCommands(currentSessionId)
      .then((commands) => {
        if (!cancelled) setSlashCommands(commands);
      })
      .catch(() => {
        if (!cancelled) setSlashCommands([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isConfigured, currentSessionId]);

  // Load persisted message history whenever the active session changes.
  // Skipped when the ID was assigned mid-stream (messages are live).
  useEffect(() => {
    if (!currentSessionId) return;
    if (skipHistoryLoadRef.current) {
      skipHistoryLoadRef.current = false;
      return;
    }
    const ctrl = new AbortController();
    setLoadingHistory(true);
    fetchSessionMessages(currentSessionId, ctrl.signal)
      .then(({ messages: history, contextUsage: savedUsage }: SessionHistoryResult) => {
        if (ctrl.signal.aborted) return;
        setMessages(
          history.map((item): MessageItem => {
            if ("type" in item && (item as CompactionMarker).type === "compaction_marker") {
              const cm = item as CompactionMarker;
              return {
                id: cm.id,
                type: "compaction_marker",
                compressedCount: cm.compressedCount,
                archiveId: cm.archiveId,
              };
            }
            const m = item as HistoryItem & {
              role: "user" | "assistant";
              text: string;
              thinking?: string;
              usage?: UsageStat;
            };
            return {
              id: m.id,
              role: m.role,
              text: m.text,
              thinking: m.thinking,
              usage: m.usage,
              streaming: false,
            };
          }),
        );
        // Restore the context window indicator from the persisted last-turn usage.
        if (savedUsage) setContextUsage(savedUsage);
        // Re-sync the turn counter — only count real assistant messages.
        turnIndexRef.current = history.filter(
          (m) => "role" in m && (m as { role: string }).role === "assistant",
        ).length;
      })
      .catch(() => {
        // Non-critical: leave messages empty on failure
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingHistory(false);
      });
    return () => ctrl.abort();
  }, [currentSessionId]);

  useEffect(() => {
    if (messages.length > lastMsgCountRef.current) {
      lastMsgCountRef.current = messages.length;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const flushDeltaBuffer = useCallback(() => {
    const text = pendingTextRef.current;
    const thinking = pendingThinkingRef.current;
    pendingTextRef.current = "";
    pendingThinkingRef.current = "";
    deltaTimerRef.current = null;
    if (!text && !thinking) return;
    setMessages((prev) => {
      const idx = prev.findLastIndex((m) => !isCompactionMarkerItem(m) && m.role === "assistant");
      if (idx === -1) return prev;
      const next = [...prev];
      const msg = next[idx] as DisplayMessage;
      next[idx] = {
        ...msg,
        text: text ? msg.text + text : msg.text,
        thinking: thinking ? (msg.thinking ?? "") + thinking : msg.thinking,
      };
      return next;
    });
  }, []);

  const scheduleDeltaFlush = useCallback(() => {
    if (!deltaTimerRef.current) {
      deltaTimerRef.current = setTimeout(flushDeltaBuffer, 50);
    }
  }, [flushDeltaBuffer]);

  const patchLastAssistant = useCallback((updater: (msg: DisplayMessage) => DisplayMessage) => {
    setMessages((prev) => {
      const idx = prev.findLastIndex((m) => !isCompactionMarkerItem(m) && m.role === "assistant");
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = updater(next[idx]! as DisplayMessage);
      return next;
    });
  }, []);

  // sourceFilter is required when called from turn_end to prevent a sub-agent
  // turn_end from accidentally deactivating the main agent's still-open turn.
  const patchActiveTurn = useCallback(
    (updater: (turn: TurnActions) => TurnActions, sourceFilter?: "main" | "skill") => {
      setTurns((prev) => {
        const idx = prev.findLastIndex(
          (t) => t.active && (sourceFilter === undefined || t.source === sourceFilter),
        );
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = updater(next[idx]!);
        return next;
      });
    },
    [],
  );

  const handleFilesSelected = useCallback((files: File[]) => {
    const MAX_SIZE = 10 * 1024 * 1024;
    for (const file of files) {
      if (file.size > MAX_SIZE) {
        alert(`File "${file.name}" exceeds the 10 MB limit and was skipped.`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Strip the "data:<mime>;base64," prefix to get pure base64
        const base64 = dataUrl.split(",")[1] ?? dataUrl;
        setPendingAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            base64,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
          },
        ]);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!isConfigured) return;
      const trimmed = text.trim();
      const attachmentsSnapshot = pendingAttachments;
      if (!trimmed && attachmentsSnapshot.length === 0) return;
      if (busy) return;

      if (trimmed.startsWith("/") && attachmentsSnapshot.length === 0) {
        setBusy(true);
        setInput("");
        try {
          const result = await runCommand(trimmed, currentSessionId);
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "system",
              text: [`**${result.command}**`, "", result.message].join("\n"),
              streaming: false,
            },
          ]);
        } finally {
          setBusy(false);
        }
        return;
      }

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setBusy(true);
      setInput("");
      setPendingAttachments([]);
      // Reset activity list for this new request so the panel shows only current turn's actions
      setTurns([]);
      // Trace accumulator for the new agent run is started by the agent_start event

      const displayText = trimmed || attachmentsSnapshot.map((a) => `[${a.name}]`).join(" ");
      const userMsg: DisplayMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: displayText,
        streaming: false,
      };
      const assistantMsg: DisplayMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "",
        streaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      let resolvedSessionId = currentSessionId;

      try {
        for await (const event of streamChat(
          trimmed,
          currentSessionId,
          ctrl.signal,
          attachmentsSnapshot,
          inputMode,
        )) {
          if (ctrl.signal.aborted) break;

          // Feed every event into the trace accumulator (non-invasive side-channel)
          feedTraceEvent(event);

          // Feed orchestration events to the orchestration state
          if (
            event.type.startsWith("orchestration_") ||
            event.type.startsWith("subagent_") ||
            event.type.startsWith("wait_")
          ) {
            feedOrchestrationEvent(event as OrchestrationStreamEvent);
          } else if (event.type.startsWith("deep_research_")) {
            feedDeepResearchEvent(event as DeepResearchStreamEvent);
          }

          if (event.type === "session_id") {
            const sid = event as { type: "session_id"; sessionId: string };
            resolvedSessionId = sid.sessionId;
            skipHistoryLoadRef.current = true;
            setCurrentSessionId(sid.sessionId);
          } else if (event.type === "skill_start") {
            const se = event as { type: "skill_start"; skillName: string };
            // Sub-agent mode confirmed — discard any pending direct-mode tracking.
            pendingDirectSkillRef.current = null;
            activeSkillRef.current = se.skillName;
            setLiveSkillActivity({ skillName: se.skillName, toolName: null });
          } else if (event.type === "skill_end") {
            activeSkillRef.current = null;
            setLiveSkillActivity(null);
          } else if (event.type === "message.update" || event.type === "message_update") {
            const mu = event as { type: string; event: { type: string; delta?: string } };
            if (mu.event.type === "text_delta" && typeof mu.event.delta === "string") {
              pendingTextRef.current += mu.event.delta;
              scheduleDeltaFlush();
            } else if (mu.event.type === "thinking_delta" && typeof mu.event.delta === "string") {
              pendingThinkingRef.current += mu.event.delta;
              scheduleDeltaFlush();
            }
          } else if (event.type === "tool.before" || event.type === "tool_execution_start") {
            const tes = event as {
              type: string;
              toolCallId: string;
              toolName: string;
              args: unknown;
            };
            const newToolCall: DisplayToolCall = {
              id: tes.toolCallId,
              name: tes.toolName,
              args: tes.args,
              done: false,
            };
            // In direct execution mode the Skill tool fires in the main agent context
            // (activeSkillRef is null). Track it so we can activate the indicator once
            // it returns — the absence of skill_start confirms it is direct mode.
            if (tes.toolName === "Skill" && activeSkillRef.current === null) {
              const skillArgs = tes.args as { skillName?: string };
              if (skillArgs?.skillName) {
                pendingDirectSkillRef.current = {
                  toolCallId: tes.toolCallId,
                  skillName: skillArgs.skillName,
                };
              }
            }
            const currentSkill = activeSkillRef.current;
            if (currentSkill) {
              setLiveSkillActivity({ skillName: currentSkill, toolName: tes.toolName });
            }
            setTurns((prev) => {
              // When inside a skill, look for an active SKILL turn. When in main agent, look for an
              // active MAIN turn. This prevents sub-agent tool calls from being mixed into the main turn.
              const source: "main" | "skill" = currentSkill ? "skill" : "main";
              const activeIdx = prev.findLastIndex((t) => t.active && t.source === source);
              if (activeIdx !== -1) {
                const next = [...prev];
                next[activeIdx] = {
                  ...next[activeIdx]!,
                  toolCalls: [...next[activeIdx]!.toolCalls, newToolCall],
                };
                return next;
              } else {
                const turnIndex = turnIndexRef.current++;
                return [
                  ...prev,
                  {
                    turnIndex,
                    toolCalls: [newToolCall],
                    active: true,
                    source,
                    skillName: currentSkill ?? undefined,
                  },
                ];
              }
            });
          } else if (event.type === "turn.complete") {
            const te = event as { type: "turn.complete"; message: { stopReason: string } };
            if (te.message?.stopReason === "error") {
              patchLastAssistant((m) => ({
                ...m,
                text:
                  m.text ||
                  "The model returned an error. Check your API key and model configuration.",
                streaming: false,
              }));
            }
            // Deactivate only the turn matching the current context (main vs skill) to prevent
            // sub-agent turn_end from accidentally deactivating the main agent's turn.
            patchActiveTurn(
              (t) => ({ ...t, active: false }),
              activeSkillRef.current ? "skill" : "main",
            );
          } else if (event.type === "context_compaction_start") {
            setCompacting(true);
          } else if (event.type === "context_compaction_end") {
            setCompacting(false);
          } else if (event.type === "context_usage") {
            const cu = event as {
              type: "context_usage";
              inputTokens: number;
              outputTokens: number;
              budgetUsedPct: number;
            };
            setContextUsage({
              inputTokens: cu.inputTokens,
              outputTokens: cu.outputTokens,
              budgetUsedPct: cu.budgetUsedPct,
            });
          } else if (event.type === "session.end") {
            const ae = event as { type: "session.end"; usage: UsageStat };
            patchLastAssistant((m) => ({ ...m, usage: ae.usage, streaming: false }));
            // Clear any lingering direct-mode skill indicator (direct mode has no skill_end event).
            if (activeSkillRef.current !== null) {
              activeSkillRef.current = null;
              setLiveSkillActivity(null);
            }
            pendingDirectSkillRef.current = null;
            // Persist session metadata
            if (resolvedSessionId) {
              upsert({
                sessionId: resolvedSessionId,
                title: null,
                lastMessage: displayText.slice(0, 60),
                updatedAt: Date.now(),
              });
            }
          } else if (event.type === "waiting_for_user_input") {
            const wq = event as {
              type: "waiting_for_user_input";
              toolCallId: string;
              question: string;
              hint?: string;
              options?: string[];
              multiple?: boolean;
              custom?: boolean;
            };
            setWaitingQuestion({
              toolCallId: wq.toolCallId,
              question: wq.question,
              hint: wq.hint,
              options: wq.options,
              multiple: wq.multiple,
              custom: wq.custom,
            });
            setQuestionInput("");
            setSelectedOptions([]);
          } else if (event.type === "tool.after" || event.type === "tool_execution_end") {
            const tee = event as {
              type: string;
              toolCallId: string;
              result: unknown;
              isError: boolean;
            };
            // Clear waiting question once the ask_user_question tool result arrives
            setWaitingQuestion((prev) => (prev?.toolCallId === tee.toolCallId ? null : prev));
            // If this is the Skill tool returning in direct execution mode (pendingDirectSkillRef
            // is still set — skill_start never fired), activate the skill activity indicator.
            // Subsequent tool calls (bash, read, etc.) will be grouped under this skill turn.
            if (pendingDirectSkillRef.current?.toolCallId === tee.toolCallId && !tee.isError) {
              const { skillName } = pendingDirectSkillRef.current;
              pendingDirectSkillRef.current = null;
              activeSkillRef.current = skillName;
              setLiveSkillActivity({ skillName, toolName: null });
            }
            // Search ALL turns (not just the active one) so that the Skill tool call in the main
            // turn can be marked done even after the main turn was briefly deactivated by a
            // sub-agent turn_end and then reactivated — or simply after being found anywhere.
            setTurns((prev) =>
              prev.map((turn) => ({
                ...turn,
                toolCalls: turn.toolCalls.map((tc) =>
                  tc.id === tee.toolCallId
                    ? { ...tc, result: tee.result, isError: tee.isError, done: true }
                    : tc,
                ),
              })),
            );
          } else if (event.type === "error") {
            const raw = event as { type: "error"; error: unknown };
            const msg =
              typeof raw.error === "object" && raw.error !== null && "message" in raw.error
                ? String((raw.error as { message: unknown }).message)
                : "Unknown error";
            patchLastAssistant((m) => ({
              ...m,
              text: m.text || msg,
              streaming: false,
            }));
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          patchLastAssistant((m) => ({
            ...m,
            text: m.text || `Error: ${(err as Error).message}`,
            streaming: false,
          }));
        }
      } finally {
        // Flush any remaining buffered deltas before marking streaming done
        if (deltaTimerRef.current) {
          clearTimeout(deltaTimerRef.current);
          deltaTimerRef.current = null;
        }
        flushDeltaBuffer();
        patchLastAssistant((m) => ({ ...m, streaming: false }));
        // Deactivate any remaining active turns (both main and skill)
        setTurns((prev) => prev.map((t) => ({ ...t, active: false })));
        activeSkillRef.current = null;
        setLiveSkillActivity(null);
        setCompacting(false);
        setWaitingQuestion(null);
        setQuestionInput("");
        setSelectedOptions([]);
        setBusy(false);
      }
    },
    [
      isConfigured,
      busy,
      pendingAttachments,
      currentSessionId,
      patchLastAssistant,
      patchActiveTurn,
      upsert,
      flushDeltaBuffer,
      scheduleDeltaFlush,
      feedTraceEvent,
      inputMode,
      feedDeepResearchEvent,
      feedOrchestrationEvent,
    ],
  );

  const startNewSession = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setTurns([]);
    setCurrentSessionId(null);
    setContextUsage(null);
    setCompacting(false);
    setWaitingQuestion(null);
    setQuestionInput("");
    setSelectedOptions([]);
    turnIndexRef.current = 0;
    activeSkillRef.current = null;
    setBusy(false);
    setInput("");
    clearTrace();
    clearOrchestrationState();
    clearDeepResearchState();
    setRequestedWorkspaceTab(null);
  }, [clearTrace, clearOrchestrationState, clearDeepResearchState]);

  const switchSession = useCallback(
    (sessionId: string) => {
      if (sessionId === currentSessionId) return;
      abortRef.current?.abort();
      setMessages([]);
      setTurns([]);
      setBusy(false);
      setInput("");
      setWaitingQuestion(null);
      setQuestionInput("");
      setSelectedOptions([]);
      clearTrace();
      clearOrchestrationState();
      clearDeepResearchState();
      setRequestedWorkspaceTab(null);
      // Setting sessionId triggers the history-load useEffect
      setCurrentSessionId(sessionId);
    },
    [currentSessionId, clearTrace, clearOrchestrationState, clearDeepResearchState],
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      remove(sessionId);
      if (sessionId === currentSessionId) {
        startNewSession();
      }
      void deleteSessionApi(sessionId);
    },
    [currentSessionId, remove, startNewSession],
  );

  const expandCompaction = useCallback(
    async (markerId: string, archiveId?: string | null) => {
      if (!currentSessionId) return;
      setMessages((prev) =>
        prev.map((m) =>
          isCompactionMarkerItem(m) && m.id === markerId ? { ...m, loading: true } : m,
        ),
      );
      try {
        const compacted = await fetchCompactedMessages(currentSessionId, archiveId);
        setMessages((prev) => {
          const idx = prev.findIndex((m) => isCompactionMarkerItem(m) && m.id === markerId);
          if (idx < 0) return prev;
          const displayMessages: DisplayMessage[] = compacted.map((hm, i) => ({
            id: `compacted-${markerId}-${i}`,
            role: hm.role,
            text: hm.text,
            usage: hm.usage,
            streaming: false,
          }));
          return [...prev.slice(0, idx), ...displayMessages, ...prev.slice(idx + 1)];
        });
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            isCompactionMarkerItem(m) && m.id === markerId ? { ...m, loading: false } : m,
          ),
        );
      }
    },
    [currentSessionId],
  );

  // Show a blank screen while we probe the server for auth requirements
  if (!authReady) return null;

  // Auth required and no valid token yet → show login gate
  if (!isAuthed) {
    return <TokenGate onSuccess={saveToken} />;
  }

  if (!isConfigured) {
    return (
      <SettingsModal
        initialTenantId={identity.tenantId}
        initialUserId={identity.userId}
        onSave={saveIdentity}
      />
    );
  }

  return (
    <div
      className={`app ${workspaceOpen ? "workspace-open" : ""}`}
      style={
        workspaceOpen
          ? ({ "--workspace-w": `${workspaceWidth}px` } as React.CSSProperties)
          : undefined
      }
    >
      {settingsOpen && (
        <SettingsModal
          initialTenantId={identity.tenantId}
          initialUserId={identity.userId}
          onSave={(t, u) => {
            saveIdentity(t, u);
            setSettingsOpen(false);
          }}
          onCancel={() => setSettingsOpen(false)}
        />
      )}
      {/* Left: Session list */}
      <SessionSidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelect={switchSession}
        onNew={startNewSession}
        onDelete={deleteSession}
      />

      {/* Middle: Chat */}
      <div className="chat-pane">
        <header className="header">
          <div className="header-left">
            <div className="logo">AP</div>
            <div>
              <div className="header-title">Agentrail Playground</div>
              <div className="header-subtitle">
                {currentSessionId
                  ? `Session ${currentSessionId.slice(0, 8)}…`
                  : "LLM-powered agent workspace"}
              </div>
            </div>
          </div>
          <div className="header-right">
            {messages.some((m) => !isCompactionMarkerItem(m)) && (
              <span className="turn-count">
                {Math.ceil(
                  messages.filter((m) => !isCompactionMarkerItem(m) && m.role !== "system").length /
                    2,
                )}{" "}
                turns
              </span>
            )}
            {contextUsage && <ContextUsageIndicator usage={contextUsage} />}
            <button
              className="settings-gear-btn"
              onClick={() => setSettingsOpen(true)}
              title={`Identity: ${identity.tenantId} / ${identity.userId}`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <button
              className={`workspace-toggle-btn ${workspaceOpen ? "active" : ""}`}
              onClick={() => setWorkspaceOpen((o) => !o)}
              title={workspaceOpen ? "Close workspace" : "Open workspace"}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M15 3v18" />
              </svg>
            </button>
            <button
              className="clear-btn"
              onClick={startNewSession}
              disabled={busy && messages.length === 0}
            >
              New
            </button>
          </div>
        </header>

        <main className="messages-area">
          {loadingHistory ? (
            <div className="empty-state">
              <div className="empty-glyph" style={{ animation: "spin 1.2s linear infinite" }}>
                ◈
              </div>
              <p className="empty-sub">Loading history…</p>
            </div>
          ) : messages.length === 0 ? (
            currentSessionId ? (
              <div className="empty-state">
                <div className="empty-glyph">◈</div>
                <p className="empty-title">No messages yet</p>
                <p className="empty-sub">Send a message to get started.</p>
              </div>
            ) : (
              <div className="empty-state welcome-state">
                <div className="welcome-mark">◈</div>
                <div className="welcome-card">
                  <p className="welcome-kicker">Agent Workspace</p>
                  <p className="welcome-title">Agentrail Playground</p>
                  <p className="welcome-copy">
                    Ask the agent anything, or let it help you with analysis, research, and task
                    execution.
                    <br />
                    Switch to <b>Deep Research</b> mode for systematic, in-depth investigation.
                  </p>
                </div>
              </div>
            )
          ) : (
            messages.map((msg) =>
              isCompactionMarkerItem(msg) ? (
                <CompactionSeparator
                  key={msg.id}
                  item={msg}
                  onExpand={() => void expandCompaction(msg.id, msg.archiveId)}
                />
              ) : (
                <MessageBubble key={msg.id} message={msg} />
              ),
            )
          )}
          {deepResearchState && (
            <DeepResearchRunCard
              state={deepResearchState}
              derived={deepResearchDerived}
              onOpenPanel={openDeepResearchWorkspace}
            />
          )}
          {liveSkillActivity && (
            <div className="skill-activity">
              <span className="skill-activity-dot" />
              <span className="skill-activity-skill">{liveSkillActivity.skillName}</span>
              {liveSkillActivity.toolName && (
                <>
                  <span className="skill-activity-sep">›</span>
                  <span className="skill-activity-tool">{liveSkillActivity.toolName}</span>
                </>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </main>

        {compacting && <CompactionBanner />}
        <WaitingQuestionPrompt
          sessionId={currentSessionId}
          waitingQuestion={waitingQuestion}
          questionInput={questionInput}
          selectedOptions={selectedOptions}
          onQuestionInputChange={setQuestionInput}
          onSelectedOptionsChange={setSelectedOptions}
          onDismiss={() => setWaitingQuestion(null)}
        />
        <InputBar
          value={input}
          onChange={setInput}
          onSend={send}
          slashCommands={slashCommands}
          mode={inputMode}
          onModeChange={setInputMode}
          disabled={busy || loadingHistory || !isConfigured}
          notConfigured={!isConfigured}
          attachments={pendingAttachments}
          onFilesSelected={handleFilesSelected}
          onRemoveAttachment={(i) =>
            setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i))
          }
        />
      </div>

      {/* Right: Agent Workspace */}
      {workspaceOpen && (
        <AgentWorkspace
          turns={turns}
          traces={traces}
          envelopes={traceEnvelopes}
          onClose={closeWorkspace}
          sessionId={currentSessionId ?? undefined}
          onWidthChange={setWorkspaceWidth}
          requestedTab={requestedWorkspaceTab}
          onRequestedTabHandled={() => setRequestedWorkspaceTab(null)}
          orchestrationState={orchestrationState}
          orchestrationLoading={orchestrationLoading}
          deepResearchState={deepResearchState}
          deepResearchLoading={deepResearchLoading}
        />
      )}

      {tourActive && <OnboardingTour onDone={() => setTourActive(false)} />}
    </div>
  );
}
