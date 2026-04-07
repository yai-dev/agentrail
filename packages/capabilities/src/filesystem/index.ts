/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { CapabilityBuildContext, CapabilityDescriptor } from "../types.js";
import type { SandboxManager } from "../sandbox/index.js";
import {
  createSandboxedBash,
  createSandboxedEdit,
  createSandboxedGrep,
  createSandboxedRead,
  createSandboxedWrite,
} from "../sandbox/index.js";
import { createTodoWriteTool } from "../tools/index.js";

export interface FilesystemOptions {
  /** Override the sandbox manager (e.g. from a custom image). */
  sandboxManager?: SandboxManager;
}

/**
 * Capability that provides sandboxed filesystem tools:
 * bash, read, write, edit, grep, and todo-write.
 *
 * @see {@link https://agentrail.run/capabilities/filesystem}
 */
export function filesystem(opts?: FilesystemOptions): CapabilityDescriptor {
  return {
    type: "filesystem",

    async buildTools(ctx: CapabilityBuildContext) {
      const sm = opts?.sandboxManager ?? ctx.sandboxManager;
      if (!sm) {
        throw new Error(
          'filesystem() capability requires a SandboxManager. ' +
          'Pass one via filesystem({ sandboxManager }) or ensure the host provides it.',
        );
      }
      const { tenantId, userId, sessionId, sessionRef, sessionStore } = ctx;

      const todoStorage = sessionStore.createTodoStorage?.(sessionRef);
      const tools = [
        createSandboxedBash(sm, sessionId, tenantId, userId),
        createSandboxedRead(sm, sessionId, tenantId, userId),
        createSandboxedWrite(sm, sessionId, tenantId, userId),
        createSandboxedEdit(sm, sessionId, tenantId, userId),
        createSandboxedGrep(sm, sessionId, tenantId, userId),
      ];

      if (todoStorage) {
        tools.push(createTodoWriteTool(todoStorage));
      }

      return tools;
    },
  };
}
