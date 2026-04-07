/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  ParsedSlashCommand,
  SlashCommandContext,
  SlashCommandResult,
} from "@agentrail/app";
import { buildSummarizeFn } from "../../agents/summarizer.js";
import { sandboxManager, sessionManager } from "../../context/index.js";

export async function handleCompactCommand(
  parsed: ParsedSlashCommand,
  context: SlashCommandContext,
): Promise<SlashCommandResult> {
  if (!context.sessionId) {
    return {
      command: `/${parsed.tokens.join(" ")}`,
      status: "error",
      message: "`/compact` 需要在已有会话里执行。",
      sessionId: null,
    };
  }

  const messages = await sessionManager.loadAllMessages(context.tenantId, context.sessionId);
  if (messages.length < 6) {
    return {
      command: `/${parsed.tokens.join(" ")}`,
      status: "noop",
      message: "当前会话消息不足，暂时没有可压缩的上下文。",
      sessionId: context.sessionId,
    };
  }

  const summarizeFn = buildSummarizeFn();
  const workspaceSnapshot = await sandboxManager
    .listWorkspace(context.sessionId)
    .catch(() => undefined);
  const result = await sessionManager.compactSession(
    context.tenantId,
    context.sessionId,
    summarizeFn,
    {
      force: true,
      preloadedMessages: messages,
      workspaceSnapshot,
    },
  );

  if (!result) {
    return {
      command: `/${parsed.tokens.join(" ")}`,
      status: "noop",
      message: "当前会话没有满足安全门槛的可压缩历史。",
      sessionId: context.sessionId,
    };
  }

  return {
    command: `/${parsed.tokens.join(" ")}`,
    status: "completed",
    message: `已压缩当前会话的历史上下文，归档 ${result.archiveId} 已生成；下一轮对话会直接使用压缩后的上下文。`,
    sessionId: context.sessionId,
    details: {
      archiveId: result.archiveId,
      compressedCount: result.compressedCount,
      totalTokens: result.totalTokens,
    },
  };
}
