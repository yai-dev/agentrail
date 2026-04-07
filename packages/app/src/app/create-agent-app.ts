/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Message } from "@agentrail/core";
import type { SandboxManager } from "@agentrail/capabilities";
import type { AgentrailPlugin, ContextProvider } from "../host/types.js";
import type { ProfileDefinition } from "../profile/define-profile.js";
import { SessionManager } from "../session/session-manager.js";
import { createChatRoute } from "../routes/chat-route.js";
import { createStreamRoute } from "../routes/stream-route.js";
import { createProfileResolver } from "../host/profile-registry.js";
import { Hono } from "hono";

/**
 * Top-level options for `createAgentApp()`.
 *
 * @see {@link https://agentrail.run/reference/create-agent-app}
 */
export interface CreateAgentAppOptions {
  /**
   * Directory used for persistent session storage.
   * The `SessionManager` writes session history here.
   */
  dataDir: string;
  /**
   * Profiles available to the app.
   * The first profile is used as the default when requests omit `agentId`.
   */
  profiles: ProfileDefinition[];
  /**
   * Optional summarizer for context-window compaction.
   * When omitted, the agent will stop responding when the context fills up.
   */
  summarize?: (messages: Message[]) => Promise<string>;
  /**
   * Compaction trigger thresholds.
   * Defaults to `{ triggerTokens: 150_000, minMessages: 20 }`.
   */
  compaction?: {
    triggerTokens: number;
    minMessages: number;
  };
  /**
   * App-level plugins for request interception and lifecycle hooks.
   */
  plugins?: AgentrailPlugin[];
  /**
   * Static context providers prepended to every request.
   */
  contextProviders?: ContextProvider[];
  /**
   * Sandbox manager for upload handling and workspace snapshots in the stream route.
   * Required when using the `/stream` endpoint with file upload features.
   */
  sandboxManager?: SandboxManager;
}

/**
 * Creates a fully configured Hono application with chat and stream endpoints.
 *
 * ```ts
 * const app = createAgentApp({
 *   dataDir: "./data",
 *   profiles: [myProfile],
 *   summarize: async (messages) => summarizer(messages),
 * });
 *
 * serve(app);
 * ```
 *
 * @see {@link https://agentrail.run/reference/create-agent-app}
 */
export function createAgentApp(options: CreateAgentAppOptions): Hono {
  const {
    dataDir,
    profiles,
    summarize,
    compaction = { triggerTokens: 150_000, minMessages: 20 },
    plugins = [],
    contextProviders = [],
    sandboxManager,
  } = options;

  if (profiles.length === 0) {
    throw new Error("createAgentApp: at least one profile is required.");
  }

  const defaultAgentId = profiles[0].id;
  const sessionManager = new SessionManager(dataDir);
  const resolveProfile = createProfileResolver(profiles);

  const noop = async (messages: Message[]) => {
    return messages.map((m) => ("content" in m ? String(m.content) : "")).join("\n");
  };
  const summarizeFn = summarize ?? noop;

  const chatRouteOptions = {
    defaultAgentId,
    sessionStore: sessionManager,
    summarize: summarizeFn,
    compaction,
    resolveProfile,
    plugins,
    contextProviders,
  };

  const app = new Hono();
  app.route("/chat", createChatRoute(chatRouteOptions));

  if (sandboxManager) {
    const streamRouteOptions = {
      ...chatRouteOptions,
      dataDir,
      sandboxManager,
    };
    app.route("/stream", createStreamRoute(streamRouteOptions));
  }

  return app;
}
