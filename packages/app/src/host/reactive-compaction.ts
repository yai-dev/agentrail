/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  AssistantMessage,
  Message,
  ReactiveCompactionContext,
  ReactiveCompactionController,
  ReactiveCompactionDecision,
  ReactiveCompactionRecord,
  Usage,
} from "@agentrail/core";

export interface CompactionSummaryContext {
  reason: "session_compaction" | "reactive_micro" | "reactive_full";
}

export type SummarizeMessagesFn = (
  messages: Message[],
  ctx?: CompactionSummaryContext,
) => Promise<string>;

export interface ReactiveCompactionConfig {
  enabled?: boolean;
  microTriggerPct?: number;
  fullTriggerPct?: number;
  preserveRecentApiRounds?: number;
  microBatchGroups?: number;
  maxReactiveCompactionsPerRequest?: number;
}

export interface ResolvedReactiveCompactionConfig {
  enabled: boolean;
  microTriggerPct: number;
  fullTriggerPct: number;
  preserveRecentApiRounds: number;
  microBatchGroups: number;
  maxReactiveCompactionsPerRequest: number;
}

export const DEFAULT_REACTIVE_COMPACTION_CONFIG: ResolvedReactiveCompactionConfig = {
  enabled: true,
  microTriggerPct: 85,
  fullTriggerPct: 92,
  preserveRecentApiRounds: 2,
  microBatchGroups: 2,
  maxReactiveCompactionsPerRequest: 3,
};

const MICRO_SUMMARY_PREFIX = "[Agentrail reactive micro-compaction summary]";
const FULL_SUMMARY_PREFIX = "[Agentrail reactive full-compaction summary]";

interface ReactiveGroup {
  messages: Message[];
  compactable: boolean;
}

interface ReactiveSelection {
  beforePrompt: number[];
  afterPrompt: number[];
}

export function resolveReactiveCompactionConfig(
  config?: ReactiveCompactionConfig,
): ResolvedReactiveCompactionConfig {
  return {
    enabled: config?.enabled ?? DEFAULT_REACTIVE_COMPACTION_CONFIG.enabled,
    microTriggerPct: config?.microTriggerPct ?? DEFAULT_REACTIVE_COMPACTION_CONFIG.microTriggerPct,
    fullTriggerPct: config?.fullTriggerPct ?? DEFAULT_REACTIVE_COMPACTION_CONFIG.fullTriggerPct,
    preserveRecentApiRounds:
      config?.preserveRecentApiRounds ?? DEFAULT_REACTIVE_COMPACTION_CONFIG.preserveRecentApiRounds,
    microBatchGroups:
      config?.microBatchGroups ?? DEFAULT_REACTIVE_COMPACTION_CONFIG.microBatchGroups,
    maxReactiveCompactionsPerRequest:
      config?.maxReactiveCompactionsPerRequest ??
      DEFAULT_REACTIVE_COMPACTION_CONFIG.maxReactiveCompactionsPerRequest,
  };
}

export function groupMessagesByApiRound(messages: Message[]): Message[][] {
  const groups: Message[][] = [];
  let current: Message[] = [];

  for (const message of messages) {
    if (message.role === "assistant" && current.length > 0) {
      groups.push(current);
      current = [message];
    } else {
      current.push(message);
    }
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

export function createReactiveCompactionController(input: {
  summarize: SummarizeMessagesFn;
  contextWindow?: number;
  config?: ReactiveCompactionConfig;
}): ReactiveCompactionController {
  const resolved = resolveReactiveCompactionConfig(input.config);
  const contextWindow = input.contextWindow ?? 200_000;

  const controller: ReactiveCompactionController = {
    isPromptTooLongError(message: AssistantMessage): boolean {
      const raw = message.errorMessage ?? "";
      const normalized = raw.toLowerCase();
      return (
        normalized.includes("context window exceeds limit") ||
        normalized.includes("context_length_exceeded") ||
        normalized.includes("prompt too long") ||
        normalized.includes("prompt_too_long")
      );
    },

    async maybeCompact(context: ReactiveCompactionContext) {
      if (!resolved.enabled) return null;
      if (context.records.length >= resolved.maxReactiveCompactionsPerRequest) return null;

      const protectedStart = findProtectedStartIndex(
        context.messages,
        context.protectedMessages ?? [],
      );
      const beforePromptGroups = groupMessagesByApiRound(
        protectedStart > 0 ? context.messages.slice(0, protectedStart) : [],
      ).map((messages) => ({ messages, compactable: true }));

      const postPromptGroups = groupMessagesByApiRound(context.messages.slice(protectedStart)).map(
        (messages, index) => ({
          messages,
          compactable: protectedStart >= context.messages.length ? true : index !== 0,
        }),
      );

      const strategy = chooseStrategy({
        contextWindow,
        usage: context.usage,
        latestMessage: context.latestMessage,
        records: context.records,
        config: resolved,
      });
      if (!strategy) return null;

      const selection = selectGroups(strategy, beforePromptGroups, postPromptGroups, resolved);
      if (selection.beforePrompt.length === 0 && selection.afterPrompt.length === 0) {
        return null;
      }

      const nextMessages = await applySelection({
        strategy,
        summarize: input.summarize,
        beforePromptGroups,
        afterPromptGroups: postPromptGroups,
        selection,
      });

      return {
        messages: nextMessages,
        strategy,
        trigger: context.latestMessage?.stopReason === "error" ? "prompt_too_long" : "proactive",
      } satisfies ReactiveCompactionDecision;
    },
  };

  return controller;
}

function chooseStrategy(input: {
  contextWindow: number;
  usage?: Usage;
  latestMessage?: AssistantMessage;
  records: ReactiveCompactionRecord[];
  config: ResolvedReactiveCompactionConfig;
}): "micro" | "full" | null {
  const promptTooLong = input.latestMessage?.stopReason === "error";
  if (promptTooLong) {
    const alreadyFull = input.records.some((record) => record.strategy === "full");
    return alreadyFull ? null : "full";
  }

  const usage = input.usage ? totalInputTokens(input.usage) : 0;
  if (usage <= 0) return null;

  const pctUsed = (usage / input.contextWindow) * 100;
  if (pctUsed >= input.config.fullTriggerPct) {
    return "full";
  }

  if (pctUsed >= input.config.microTriggerPct) {
    const hasMicroRecord = input.records.some((record) => record.strategy === "micro");
    return hasMicroRecord ? "full" : "micro";
  }

  return null;
}

function totalInputTokens(usage: Usage): number {
  return (usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
}

function findProtectedStartIndex(messages: Message[], protectedMessages: Message[]): number {
  if (protectedMessages.length === 0) return messages.length;

  let earliest = messages.length;
  for (const protectedMessage of protectedMessages) {
    const index = messages.indexOf(protectedMessage);
    if (index >= 0 && index < earliest) {
      earliest = index;
    }
  }
  return earliest;
}

function selectGroups(
  strategy: "micro" | "full",
  beforePromptGroups: ReactiveGroup[],
  afterPromptGroups: ReactiveGroup[],
  config: ResolvedReactiveCompactionConfig,
): ReactiveSelection {
  const beforeCandidates = selectRegionCandidates(
    beforePromptGroups,
    config.preserveRecentApiRounds,
  );
  const afterCandidates = selectRegionCandidates(afterPromptGroups, config.preserveRecentApiRounds);

  if (strategy === "micro") {
    if (beforeCandidates.length > 0) {
      return {
        beforePrompt: beforeCandidates.slice(0, config.microBatchGroups),
        afterPrompt: [],
      };
    }
    return {
      beforePrompt: [],
      afterPrompt: afterCandidates.slice(0, config.microBatchGroups),
    };
  }

  return {
    beforePrompt: beforeCandidates,
    afterPrompt: afterCandidates,
  };
}

function selectRegionCandidates(groups: ReactiveGroup[], preserveRecent: number): number[] {
  const keepFrom = Math.max(0, groups.length - preserveRecent);
  const candidates: number[] = [];

  for (let i = 0; i < groups.length; i++) {
    if (!groups[i]!.compactable) continue;
    if (i >= keepFrom) continue;
    candidates.push(i);
  }

  return candidates;
}

async function applySelection(input: {
  strategy: "micro" | "full";
  summarize: SummarizeMessagesFn;
  beforePromptGroups: ReactiveGroup[];
  afterPromptGroups: ReactiveGroup[];
  selection: ReactiveSelection;
}): Promise<Message[]> {
  const result: Message[] = [];

  const summarizedBefore = await summarizeRegion(
    input.strategy,
    input.summarize,
    input.beforePromptGroups,
    input.selection.beforePrompt,
  );
  result.push(...summarizedBefore);

  const summarizedAfter = await summarizeRegion(
    input.strategy,
    input.summarize,
    input.afterPromptGroups,
    input.selection.afterPrompt,
  );
  result.push(...summarizedAfter);

  return result;
}

async function summarizeRegion(
  strategy: "micro" | "full",
  summarize: SummarizeMessagesFn,
  groups: ReactiveGroup[],
  selectedIndices: number[],
): Promise<Message[]> {
  if (groups.length === 0) return [];
  if (selectedIndices.length === 0) {
    return groups.flatMap((group) => group.messages);
  }

  const selected = new Set(selectedIndices);
  const summarySource = selectedIndices.flatMap((index) => groups[index]!.messages);
  const summaryText = await summarize(summarySource, {
    reason: strategy === "micro" ? "reactive_micro" : "reactive_full",
  });
  const summaryMessage: Message = {
    role: "user",
    content: `${strategy === "micro" ? MICRO_SUMMARY_PREFIX : FULL_SUMMARY_PREFIX}\n${summaryText}`,
    timestamp: Date.now(),
  };

  const rebuilt: Message[] = [];
  let inserted = false;
  for (let i = 0; i < groups.length; i++) {
    if (selected.has(i)) {
      if (!inserted) {
        rebuilt.push(summaryMessage);
        inserted = true;
      }
      continue;
    }
    rebuilt.push(...groups[i]!.messages);
  }
  return rebuilt;
}
