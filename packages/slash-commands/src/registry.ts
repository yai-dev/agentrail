/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { parseCommand } from "./parse-command.js";
import type {
  ParsedSlashCommand,
  SlashCommandContext,
  SlashCommandDefinition,
  SlashCommandResult,
} from "./types.js";

export interface SlashCommandRegistry {
  definitions(): SlashCommandDefinition[];
  parseRegistered(input: string): ParsedSlashCommand | null;
  execute(input: string, context: SlashCommandContext): Promise<SlashCommandResult>;
}

function resolveDefinition(
  definitions: SlashCommandDefinition[],
  parsed: ParsedSlashCommand,
): SlashCommandDefinition | null {
  const rawName = parsed.tokens.join(" ").toLowerCase();
  return (
    [...definitions]
      .sort((left, right) => right.name.length - left.name.length)
      .find((definition) => rawName === definition.name) ?? null
  );
}

export function createSlashCommandRegistry(
  definitions: SlashCommandDefinition[],
): SlashCommandRegistry {
  return {
    definitions: () => [...definitions],
    parseRegistered(input: string): ParsedSlashCommand | null {
      const parsed = parseCommand(input);
      if (!parsed) return null;
      return resolveDefinition(definitions, parsed) ? parsed : null;
    },
    async execute(input: string, context: SlashCommandContext): Promise<SlashCommandResult> {
      const parsed = parseCommand(input);
      if (!parsed) {
        return {
          command: input.trim(),
          status: "error",
          message: "不是有效的 slash command。",
          sessionId: context.sessionId ?? null,
        };
      }

      const definition = resolveDefinition(definitions, parsed);
      if (!definition) {
        return {
          command: parsed.raw,
          status: "error",
          message: `未知命令：${parsed.raw}`,
          sessionId: context.sessionId ?? null,
          details: {
            availableCommands: definitions.map((command) => `/${command.name}`),
          },
        };
      }

      if (definition.requiresSession && !context.sessionId) {
        return {
          command: parsed.raw,
          status: "error",
          message: `${parsed.raw} 需要在已有会话里执行。`,
          sessionId: null,
        };
      }

      return definition.handler(parsed, context);
    },
  };
}
