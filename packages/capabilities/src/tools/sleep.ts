/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { tool } from "@agentrail/core";
import { Type } from "@sinclair/typebox";

const DEFAULT_MAX_MS = 30_000;

export interface SleepToolOptions {
  /** Maximum allowed sleep duration in milliseconds. Defaults to 30_000. */
  maxMs?: number;
}

const parametersSchema = Type.Object({
  duration_ms: Type.Integer({
    description: "How long to sleep in milliseconds.",
    minimum: 0,
  }),
});

function waitForDuration(durationMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Sleep aborted"));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, durationMs);

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Sleep aborted"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Creates a tool that pauses execution for a bounded duration. */
export function createSleepTool(options: SleepToolOptions = {}) {
  const maxMs = options.maxMs ?? DEFAULT_MAX_MS;

  return tool()
    .name("Sleep")
    .label("Sleep")
    .description(
      `Pause execution for a bounded number of milliseconds.

Use this for polling loops, retry backoff, rate-limit compliance, or waiting for external side effects to settle.

Usage:
- Provide \`duration_ms\` as the requested sleep duration.
- The actual wait is clamped to at most ${maxMs} ms.
- Use short waits and re-check state between calls instead of a single long pause.`,
    )
    .parameters(parametersSchema)
    .execute(async ({ duration_ms }, ctx) => {
      const appliedMs = Math.min(duration_ms, maxMs);
      const wasClamped = appliedMs !== duration_ms;

      await waitForDuration(appliedMs, ctx.signal);

      const text = wasClamped
        ? `Requested sleep for ${duration_ms} ms; slept for ${appliedMs} ms (clamped to max).`
        : `Slept for ${appliedMs} ms.`;

      return {
        content: [{ type: "text" as const, text }],
        details: {
          requestedMs: duration_ms,
          appliedMs,
          maxMs,
          wasClamped,
        },
      };
    })
    .build();
}
