/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SandboxManager } from "@/sandbox/sandbox-manager.js";
import { tool } from "@agentrail/core";
import { Type } from "@sinclair/typebox";

const BROWSER_TIMEOUT_MS = 15_000;

const toolDescription = `Scrolls the current browser page or a specific element.

Usage:
- Scroll the whole page by providing direction and amount (or deltaX/deltaY directly).
- Scroll a specific element by providing a CSS selector in the selector parameter.
- direction: "down" | "up" | "right" | "left" — defaults to "down"
- amount: pixels to scroll — defaults to 500
- Use BrowserContent after scrolling to get newly visible content.`;

const parametersSchema = Type.Object({
  selector: Type.Optional(
    Type.String({
      description: "CSS selector of the element to scroll. If omitted, scrolls the page.",
    }),
  ),
  direction: Type.Optional(
    Type.Union(
      [Type.Literal("down"), Type.Literal("up"), Type.Literal("left"), Type.Literal("right")],
      { description: "Scroll direction. Defaults to 'down'.", default: "down" },
    ),
  ),
  amount: Type.Optional(
    Type.Integer({ description: "Pixels to scroll. Defaults to 500.", default: 500 }),
  ),
  deltaX: Type.Optional(
    Type.Integer({
      description: "Horizontal scroll delta in pixels (alternative to direction+amount).",
    }),
  ),
  deltaY: Type.Optional(
    Type.Integer({
      description: "Vertical scroll delta in pixels (alternative to direction+amount).",
    }),
  ),
});

/** Creates the browser scroll tool for moving within the current page. */
export function createBrowserScroll(
  manager: SandboxManager,
  sessionId: string,
  tenantId: string,
  userId: string,
) {
  return tool()
    .name("BrowserScroll")
    .label("Browser Scroll")
    .description(toolDescription)
    .parameters(parametersSchema)
    .execute(async ({ selector, direction, amount, deltaX, deltaY }, { signal }) => {
      await manager.ensureSandbox(sessionId, tenantId, userId);

      const browserUrl = manager.getBrowserUrl(sessionId, "/scroll");
      const abortSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(BROWSER_TIMEOUT_MS)])
        : AbortSignal.timeout(BROWSER_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(browserUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selector,
            direction: direction ?? "down",
            amount: amount ?? 500,
            deltaX,
            deltaY,
          }),
          signal: abortSignal,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Browser scroll error: ${message}` }],
          details: { error: message },
        };
      }

      const data = (await res.json()) as { scrollX?: number; scrollY?: number; error?: string };

      if (!res.ok || data.error) {
        const errMsg = data.error ?? res.statusText;
        return {
          content: [{ type: "text" as const, text: `Browser scroll error: ${errMsg}` }],
          details: { error: errMsg },
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Scrolled successfully. Page scroll position: x=${data.scrollX ?? 0}, y=${
              data.scrollY ?? 0
            }`,
          },
        ],
        details: { scrollX: data.scrollX, scrollY: data.scrollY },
      };
    })
    .build();
}
