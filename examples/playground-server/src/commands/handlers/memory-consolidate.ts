/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  ParsedSlashCommand,
  SlashCommandContext,
  SlashCommandResult,
} from "@agentrail/app";
import { userMemoryConsolidationService } from "@/context/index.js";

export async function handleMemoryConsolidateCommand(
  parsed: ParsedSlashCommand,
  context: SlashCommandContext,
): Promise<SlashCommandResult> {
  await userMemoryConsolidationService.enqueueForceRebuild(context.tenantId, context.userId);
  return {
    command: `/${parsed.tokens.join(" ")}`,
    status: "queued",
    message: "已排队整理你的长期记忆；系统会在你空闲时回顾历史会话并更新 USER.md。",
    sessionId: context.sessionId ?? null,
  };
}
