/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

export type SlashCommandScope = "session" | "user";
export type SlashCommandStatus = "completed" | "queued" | "noop" | "error";

export interface ParsedSlashCommand {
  raw: string;
  tokens: string[];
}

export interface SlashCommandContext {
  tenantId: string;
  userId: string;
  sessionId?: string;
}

export interface SlashCommandResult {
  command: string;
  status: SlashCommandStatus;
  message: string;
  sessionId?: string | null;
  details?: Record<string, unknown>;
}

export interface SlashCommandDefinition {
  name: string;
  description: string;
  scope: SlashCommandScope;
  requiresSession: boolean;
  runsInBackground: boolean;
  writesConversationHistory: boolean;
  handler: (
    parsed: ParsedSlashCommand,
    context: SlashCommandContext,
  ) => Promise<SlashCommandResult>;
}
