/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { tool } from "@agentrail/runtime-core";
import { Type } from "@sinclair/typebox";
import type { SandboxManager } from "../sandbox-manager.js";

const BROWSER_TIMEOUT_MS = 30_000;

const toolDescription = `Navigates the sandbox browser to a URL and returns the page's text content.

Usage:
- Navigates to the given URL using a persistent Chromium browser inside the sandbox.
- Returns the page title and visible text content.
- The browser session persists across calls within the same session.
- Use BrowserScroll, BrowserAction, or BrowserContent for further interaction after navigating.
- Use BrowserContent to re-read the current page's text after dynamic content loads.`;

const parametersSchema = Type.Object({
  url: Type.String({ description: "The URL to navigate to (e.g. https://example.com)." }),
});

/** Creates the browser navigation tool for visiting new URLs. */
export function createBrowserNavigate(
  manager: SandboxManager,
  sessionId: string,
  tenantId: string,
  userId: string,
) {
  return tool()
    .name("BrowserNavigate")
    .label("Browser Navigate")
    .description(toolDescription)
    .parameters(parametersSchema)
    .execute(async ({ url }, { signal }) => {
      await manager.ensureSandbox(sessionId, tenantId, userId);

      const browserUrl = manager.getBrowserUrl(sessionId, "/navigate");
      const abortSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(BROWSER_TIMEOUT_MS)])
        : AbortSignal.timeout(BROWSER_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(browserUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
          signal: abortSignal,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Browser error: ${message}` }],
          details: { error: message },
        };
      }

      const data = (await res.json()) as {
        title?: string;
        url?: string;
        textContent?: string;
        error?: string;
      };

      if (!res.ok || data.error) {
        const errMsg = data.error ?? res.statusText;
        return {
          content: [{ type: "text" as const, text: `Browser error: ${errMsg}` }],
          details: { error: errMsg },
        };
      }

      const text = `Navigated to: ${data.url}\nTitle: ${data.title}\n\n${data.textContent ?? ""}`;
      return {
        content: [{ type: "text" as const, text }],
        details: { url: data.url, title: data.title },
      };
    })
    .build();
}
