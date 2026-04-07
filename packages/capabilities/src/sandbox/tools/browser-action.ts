/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { tool } from "@agentrail/core";
import { Type } from "@sinclair/typebox";
import type { SandboxManager } from "../sandbox-manager.js";

const BROWSER_TIMEOUT_MS = 20_000;

const toolDescription = `Performs an interaction on the current browser page.

Action types:
- "click"     — Click an element identified by CSS selector.
- "fill"      — Clear and fill an input/textarea identified by CSS selector (value required).
- "select"    — Select an option in a <select> element (value is the option value or label).
- "hover"     — Hover over an element (useful for triggering tooltips or dropdown menus).
- "press"     — Press a keyboard key, optionally on a focused element (e.g. "Enter", "Escape", "Tab").
- "evaluate"  — Run arbitrary JavaScript and return the result as a string (script required).

Usage:
- Always read the page with BrowserContent before interacting so you know what selectors exist.
- After clicking a button that triggers navigation, call BrowserContent again to get the new page content.`;

const parametersSchema = Type.Object({
  type: Type.Union(
    [
      Type.Literal("click"),
      Type.Literal("fill"),
      Type.Literal("select"),
      Type.Literal("hover"),
      Type.Literal("press"),
      Type.Literal("evaluate"),
    ],
    { description: "The type of browser action to perform." },
  ),
  selector: Type.Optional(
    Type.String({
      description:
        "CSS selector of the target element (required for click, fill, select, hover, press).",
    }),
  ),
  value: Type.Optional(
    Type.String({ description: "Value to fill/select, or key to press (e.g. 'Enter')." }),
  ),
  script: Type.Optional(
    Type.String({ description: "JavaScript to evaluate (required for evaluate action)." }),
  ),
});

/** Creates the browser action tool for click, type, and related page interactions. */
export function createBrowserAction(
  manager: SandboxManager,
  sessionId: string,
  tenantId: string,
  userId: string,
) {
  return tool()
    .name("BrowserAction")
    .label("Browser Action")
    .description(toolDescription)
    .parameters(parametersSchema)
    .execute(async ({ type, selector, value, script }, { signal }) => {
      await manager.ensureSandbox(sessionId, tenantId, userId);

      const browserUrl = manager.getBrowserUrl(sessionId, "/action");
      const abortSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(BROWSER_TIMEOUT_MS)])
        : AbortSignal.timeout(BROWSER_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(browserUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, selector, value, script }),
          signal: abortSignal,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Browser action error: ${message}` }],
          details: { error: message },
        };
      }

      const data = (await res.json()) as { result?: unknown; error?: string };

      if (!res.ok || data.error) {
        const errMsg = data.error ?? res.statusText;
        return {
          content: [{ type: "text" as const, text: `Browser action error: ${errMsg}` }],
          details: { error: errMsg },
        };
      }

      const resultText =
        data.result !== undefined
          ? `Action '${type}' completed. Result: ${JSON.stringify(data.result)}`
          : `Action '${type}' completed successfully.`;

      return {
        content: [{ type: "text" as const, text: resultText }],
        details: { type, result: data.result },
      };
    })
    .build();
}
