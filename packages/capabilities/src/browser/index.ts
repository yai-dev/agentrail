/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { CapabilityBuildContext, CapabilityDescriptor } from "../types.js";
import type { SandboxManager } from "../sandbox/index.js";
import {
  createBrowserAction,
  createBrowserContent,
  createBrowserNavigate,
  createBrowserScroll,
} from "../sandbox/index.js";

export interface BrowserOptions {
  /** Override the sandbox manager (e.g. from a custom image). */
  sandboxManager?: SandboxManager;
}

/**
 * Capability that provides browser automation tools:
 * navigate, scroll, action, and read-content.
 *
 * @see {@link https://agentrail.run/capabilities/browser}
 */
export function browser(opts?: BrowserOptions): CapabilityDescriptor {
  return {
    type: "browser",

    async buildTools(ctx: CapabilityBuildContext) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const sm = (opts?.sandboxManager ?? ctx.sandboxManager)!;
      const { tenantId, userId, sessionId } = ctx;

      return [
        createBrowserNavigate(sm, sessionId, tenantId, userId),
        createBrowserScroll(sm, sessionId, tenantId, userId),
        createBrowserAction(sm, sessionId, tenantId, userId),
        createBrowserContent(sm, sessionId, tenantId, userId),
      ];
    },
  };
}
