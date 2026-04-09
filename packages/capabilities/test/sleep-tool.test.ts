/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSleepTool } from "../src/tools/sleep.js";

describe("createSleepTool", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for the requested duration when below the max", async () => {
    vi.useFakeTimers();
    const sleepTool = createSleepTool({ maxMs: 100 });

    let settled = false;
    const resultPromise = sleepTool.execute("call-1", { duration_ms: 25 }).then((result) => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(24);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await resultPromise;

    expect(result.content).toEqual([{ type: "text", text: "Slept for 25 ms." }]);
    expect(result.details).toEqual({
      requestedMs: 25,
      appliedMs: 25,
      maxMs: 100,
      wasClamped: false,
    });
  });

  it("clamps the requested duration to maxMs", async () => {
    vi.useFakeTimers();
    const sleepTool = createSleepTool({ maxMs: 20 });

    let settled = false;
    const resultPromise = sleepTool.execute("call-2", { duration_ms: 50 }).then((result) => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(19);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await resultPromise;

    expect(result.content).toEqual([
      {
        type: "text",
        text: "Requested sleep for 50 ms; slept for 20 ms (clamped to max).",
      },
    ]);
    expect(result.details).toEqual({
      requestedMs: 50,
      appliedMs: 20,
      maxMs: 20,
      wasClamped: true,
    });
  });

  it("supports zero-duration sleeps", async () => {
    vi.useFakeTimers();
    const sleepTool = createSleepTool();

    const resultPromise = sleepTool.execute("call-3", { duration_ms: 0 });
    await vi.advanceTimersByTimeAsync(0);

    await expect(resultPromise).resolves.toMatchObject({
      content: [{ type: "text", text: "Slept for 0 ms." }],
      details: {
        requestedMs: 0,
        appliedMs: 0,
        wasClamped: false,
      },
    });
  });

  it("aborts promptly when the enclosing signal is cancelled", async () => {
    vi.useFakeTimers();
    const sleepTool = createSleepTool({ maxMs: 100 });
    const controller = new AbortController();

    const resultPromise = sleepTool.execute("call-4", { duration_ms: 50 }, controller.signal);

    await vi.advanceTimersByTimeAsync(10);
    controller.abort();

    await expect(resultPromise).rejects.toThrow("Sleep aborted");
  });
});
