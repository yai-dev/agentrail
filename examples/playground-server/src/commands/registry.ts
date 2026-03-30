/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import {
  createSlashCommandRegistry,
  type ParsedSlashCommand,
  type SlashCommandContext,
  type SlashCommandDefinition,
  type SlashCommandResult,
} from "@agentrail/slash-commands";
import { handleCompactCommand } from "./handlers/compact.js";
import { handleMemoryConsolidateCommand } from "./handlers/memory-consolidate.js";

const commandDefinitions: SlashCommandDefinition[] = [
  {
    name: "memory consolidate",
    description: "Queue a background rebuild of your long-term USER.md profile.",
    scope: "user",
    requiresSession: false,
    runsInBackground: true,
    writesConversationHistory: false,
    handler: handleMemoryConsolidateCommand,
  },
  {
    name: "compact",
    description: "Compact the current session history immediately.",
    scope: "session",
    requiresSession: true,
    runsInBackground: false,
    writesConversationHistory: false,
    handler: handleCompactCommand,
  },
];

const registry = createSlashCommandRegistry(commandDefinitions);

export function getSlashCommandDefinitions(): SlashCommandDefinition[] {
  return registry.definitions();
}

export function parseRegisteredSlashCommand(input: string): ParsedSlashCommand | null {
  return registry.parseRegistered(input);
}

export async function executeSlashCommand(
  input: string,
  context: SlashCommandContext,
): Promise<SlashCommandResult> {
  return registry.execute(input, context);
}
