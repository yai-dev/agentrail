/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  AgentrailChatHandledResponse,
  AgentrailChatRequestContext,
  AgentrailPlugin,
} from "@agentrail/app";
import type { ContextProvider, ContextProviderContext, Message } from "@agentrail/core";

/**
 * A context provider that prepends the current UTC timestamp as a system
 * message before each conversation. This is injected by the plugin's
 * `contextProviders` field and runs for every request automatically.
 */
const timestampContextProvider: ContextProvider = (
  _ctx: ContextProviderContext,
  _messages: Message[],
): Message[] => {
  const now = new Date().toUTCString();
  return [
    {
      role: "user" as const,
      content: `[System context] Current UTC time: ${now}`,
      timestamp: Date.now(),
    },
  ];
};

/**
 * A capability-style plugin that demonstrates three plugin features:
 *
 * 1. `start` / `stop` — lifecycle hooks run once when the server starts/stops.
 * 2. `interceptChatRequest` — short-circuits requests matching a keyword,
 *    returning a fixed response without invoking the LLM.
 * 3. `contextProviders` — injects context (current timestamp) into every request.
 */
export function createCapabilityPlugin(): AgentrailPlugin {
  return {
    name: "capability-plugin",

    start(): void {
      console.log("[plugin] started — capability-plugin is active");
    },

    stop(): void {
      console.log("[plugin] stopped — capability-plugin is shutting down");
    },

    /**
     * If the user sends exactly "ping", skip the LLM and return "pong" directly.
     * Return null for any other message to let the agent handle it normally.
     */
    interceptChatRequest(ctx: AgentrailChatRequestContext): AgentrailChatHandledResponse | null {
      const message =
        typeof ctx.request.message === "string" ? ctx.request.message.trim().toLowerCase() : "";

      if (message === "ping") {
        console.log(`[plugin] intercepted "ping" — returning "pong" without LLM`);
        return {
          status: 200,
          body: {
            text: "pong",
            sessionId: ctx.request.sessionId ?? null,
            stopReason: "intercepted",
            usage: { inputTokens: 0, outputTokens: 0 },
          },
        };
      }

      return null;
    },

    contextProviders: [timestampContextProvider],
  };
}
