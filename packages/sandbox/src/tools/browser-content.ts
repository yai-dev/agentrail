/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { tool } from "@agentrail/runtime-core";
import { Type } from "@sinclair/typebox";
import type { SandboxManager } from "../sandbox-manager.js";

const BROWSER_TIMEOUT_MS = 15_000;

const toolDescription = `Returns the current browser page's visible text content.

Usage:
- Call this after navigating, scrolling, or interacting to read the updated page content.
- Returns clean text (no HTML tags).
- Use include_html: true only when you need to inspect the page structure or find CSS selectors.`;

const parametersSchema = Type.Object({
  include_html: Type.Optional(
    Type.Boolean({
      description: "If true, also return raw HTML (useful for finding selectors). Defaults to false.",
      default: false,
    }),
  ),
});

export function createBrowserContent(
  manager: SandboxManager,
  sessionId: string,
  tenantId: string,
  userId: string,
) {
  return tool()
    .name("BrowserContent")
    .label("Browser Content")
    .description(toolDescription)
    .parameters(parametersSchema)
    .execute(async ({ include_html }, { signal }) => {
      await manager.ensureSandbox(sessionId, tenantId, userId);

      const browserUrl = manager.getBrowserUrl(sessionId, "/content");
      const abortSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(BROWSER_TIMEOUT_MS)])
        : AbortSignal.timeout(BROWSER_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(browserUrl, { signal: abortSignal });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Browser content error: ${message}` }],
          details: { error: message },
        };
      }

      const data = await res.json() as { textContent?: string; html?: string; error?: string };

      if (!res.ok || data.error) {
        const errMsg = data.error ?? res.statusText;
        return {
          content: [{ type: "text" as const, text: `Browser content error: ${errMsg}` }],
          details: { error: errMsg },
        };
      }

      let text = data.textContent ?? "(empty page)";
      if (include_html && data.html) {
        text += `\n\n--- HTML ---\n${data.html}`;
      }

      return {
        content: [{ type: "text" as const, text }],
        details: { textContent: data.textContent, hasHtml: !!data.html },
      };
    })
    .build();
}
