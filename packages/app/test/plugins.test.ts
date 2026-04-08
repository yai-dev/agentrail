/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runPluginLifecycle,
  runPluginRequestHook,
  runPluginChatRequestInterceptors,
  runAttachmentHandlers,
  collectPluginContextProviders,
} from "../src/host/plugins.js";
import type { AgentrailPlugin, AgentrailRequestLifecycleContext, PluginErrorHandler } from "../src/host/types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockRequestContext: AgentrailRequestLifecycleContext = {
  kind: "chat",
  tenantId: "t1",
  userId: "u1",
  sessionId: "s1",
  agentId: "a1",
};

const mockChatContext = {
  kind: "chat" as const,
  request: { tenantId: "t1", userId: "u1", message: "hi" } as any,
  agentId: "a1",
  signal: new AbortController().signal,
};

function makePlugin(name: string, overrides: Partial<AgentrailPlugin> = {}): AgentrailPlugin {
  return { name, ...overrides };
}

// ─── runPluginLifecycle ────────────────────────────────────────────────────────

describe("runPluginLifecycle", () => {
  it("calls start() on all plugins", async () => {
    const start = vi.fn();
    const plugin = makePlugin("p1", { start });
    await runPluginLifecycle([plugin], "start");
    expect(start).toHaveBeenCalledOnce();
  });

  it("calls stop() on all plugins", async () => {
    const stop = vi.fn();
    const plugin = makePlugin("p1", { stop });
    await runPluginLifecycle([plugin], "stop");
    expect(stop).toHaveBeenCalledOnce();
  });

  it("start: notifies onPluginError then rethrows when a plugin throws", async () => {
    const error = new Error("start failure");
    const onError: PluginErrorHandler = vi.fn();
    const plugin = makePlugin("bad", {
      start: async () => { throw error; },
    });
    await expect(runPluginLifecycle([plugin], "start", onError)).rejects.toThrow("start failure");
    expect(onError).toHaveBeenCalledWith({ plugin: "bad", hook: "start", error });
  });

  it("stop: notifies onPluginError but continues when a plugin throws", async () => {
    const onError: PluginErrorHandler = vi.fn();
    const order: string[] = [];
    const bad = makePlugin("bad", { stop: async () => { order.push("bad"); throw new Error("stop fail"); } });
    const good = makePlugin("good", { stop: async () => { order.push("good"); } });
    await runPluginLifecycle([bad, good], "stop", onError);
    expect(onError).toHaveBeenCalledOnce();
    expect(order).toEqual(["bad", "good"]);
  });

  it("start: executes in descending priority order", async () => {
    const order: string[] = [];
    const low = makePlugin("low", { priority: 0, start: async () => { order.push("low"); } });
    const high = makePlugin("high", { priority: 100, start: async () => { order.push("high"); } });
    await runPluginLifecycle([low, high], "start");
    expect(order).toEqual(["high", "low"]);
  });

  it("stop: executes in ascending priority order (reverse of start)", async () => {
    const order: string[] = [];
    const low = makePlugin("low", { priority: 0, stop: async () => { order.push("low"); } });
    const high = makePlugin("high", { priority: 100, stop: async () => { order.push("high"); } });
    await runPluginLifecycle([low, high], "stop");
    expect(order).toEqual(["low", "high"]);
  });

  it("uses console.warn by default when no onPluginError is provided", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plugin = makePlugin("bad", { stop: async () => { throw new Error("oops"); } });
    await runPluginLifecycle([plugin], "stop");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"bad"'),
      expect.any(Error),
    );
    warn.mockRestore();
  });

  it("safeNotify: falls back to console.error when onPluginError itself throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError: PluginErrorHandler = () => { throw new Error("handler failure"); };
    const plugin = makePlugin("bad", { stop: async () => { throw new Error("original"); } });
    // Must NOT throw even though both plugin and handler threw
    await expect(runPluginLifecycle([plugin], "stop", onError)).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('"bad"'),
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it("onPluginError may be async: awaited before continuing (no fire-and-forget)", async () => {
    const order: string[] = [];
    const onError: PluginErrorHandler = async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push("handler");
    };
    const bad = makePlugin("bad", { stop: async () => { order.push("throw"); throw new Error("err"); } });
    const next = makePlugin("next", { stop: async () => { order.push("next"); } });
    await runPluginLifecycle([bad, next], "stop", onError);
    expect(order).toEqual(["throw", "handler", "next"]);
  });
});

// ─── runPluginRequestHook ──────────────────────────────────────────────────────

describe("runPluginRequestHook", () => {
  it("calls hook on all plugins", async () => {
    const onRequestStart = vi.fn();
    await runPluginRequestHook([makePlugin("p1", { onRequestStart })], "onRequestStart", mockRequestContext);
    expect(onRequestStart).toHaveBeenCalledWith(mockRequestContext);
  });

  it("isolates errors: other plugins still run", async () => {
    const onError: PluginErrorHandler = vi.fn();
    const order: string[] = [];
    const bad = makePlugin("bad", { onRequestEnd: async () => { order.push("bad"); throw new Error("boom"); } });
    const good = makePlugin("good", { onRequestEnd: async () => { order.push("good"); } });
    await runPluginRequestHook([bad, good], "onRequestEnd", mockRequestContext, onError);
    expect(onError).toHaveBeenCalledOnce();
    expect(order).toEqual(["bad", "good"]);
  });

  it("runs plugins in descending priority order", async () => {
    const order: string[] = [];
    const low = makePlugin("low", { priority: 0, onRequestStart: async () => { order.push("low"); } });
    const high = makePlugin("high", { priority: 10, onRequestStart: async () => { order.push("high"); } });
    await runPluginRequestHook([low, high], "onRequestStart", mockRequestContext);
    expect(order).toEqual(["high", "low"]);
  });
});

// ─── runPluginChatRequestInterceptors ─────────────────────────────────────────

describe("runPluginChatRequestInterceptors", () => {
  it("returns null when no plugin intercepts", async () => {
    const result = await runPluginChatRequestInterceptors(
      [makePlugin("p1")],
      mockChatContext,
    );
    expect(result).toBeNull();
  });

  it("returns the first non-null response", async () => {
    const handled = { status: 200 as const, body: { text: "handled", usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } } };
    const plugin = makePlugin("p1", { interceptChatRequest: async () => handled });
    const result = await runPluginChatRequestInterceptors([plugin], mockChatContext);
    expect(result).toBe(handled);
  });

  it("non-critical: isolates errors, notifies onPluginError, continues with null", async () => {
    const onError: PluginErrorHandler = vi.fn();
    const bad = makePlugin("bad", { interceptChatRequest: async () => { throw new Error("denied"); } });
    const result = await runPluginChatRequestInterceptors([bad], mockChatContext, onError);
    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledWith({ plugin: "bad", hook: "interceptChatRequest", error: expect.any(Error) });
  });

  it("critical: notifies onPluginError then rethrows", async () => {
    const onError: PluginErrorHandler = vi.fn();
    const error = new Error("auth failure");
    const bad = makePlugin("bad", {
      critical: true,
      interceptChatRequest: async () => { throw error; },
    });
    await expect(runPluginChatRequestInterceptors([bad], mockChatContext, onError)).rejects.toThrow("auth failure");
    expect(onError).toHaveBeenCalledWith({ plugin: "bad", hook: "interceptChatRequest", error });
  });

  it("runs plugins in descending priority order", async () => {
    const order: string[] = [];
    const low = makePlugin("low", { priority: 0, interceptChatRequest: async () => { order.push("low"); return null; } });
    const high = makePlugin("high", { priority: 5, interceptChatRequest: async () => { order.push("high"); return null; } });
    await runPluginChatRequestInterceptors([low, high], mockChatContext);
    expect(order).toEqual(["high", "low"]);
  });
});

// ─── runAttachmentHandlers ────────────────────────────────────────────────────

describe("runAttachmentHandlers", () => {
  const files = [{ name: "file.txt", mimeType: "text/plain", data: Buffer.from("data") }];

  it("returns null when no handlers produce text", async () => {
    const result = await runAttachmentHandlers(files, [makePlugin("p1")]);
    expect(result).toBeNull();
  });

  it("merges contextText from multiple plugin handlers", async () => {
    const p1 = makePlugin("p1", { attachmentHandler: async () => ({ contextText: "ctx1" }) });
    const p2 = makePlugin("p2", { attachmentHandler: async () => ({ contextText: "ctx2" }) });
    const result = await runAttachmentHandlers(files, [p1, p2]);
    expect(result?.contextText).toBe("ctx1\n\nctx2");
  });

  it("isolates errors: skips failing handler, others still run", async () => {
    const onError: PluginErrorHandler = vi.fn();
    const bad = makePlugin("bad", { attachmentHandler: async () => { throw new Error("fail"); } });
    const good = makePlugin("good", { attachmentHandler: async () => ({ contextText: "ok" }) });
    const result = await runAttachmentHandlers(files, [bad, good], undefined, onError);
    expect(result?.contextText).toBe("ok");
    expect(onError).toHaveBeenCalledWith({ plugin: "bad", hook: "attachmentHandler", error: expect.any(Error) });
  });

  it("includes fallbackHandler result", async () => {
    const fallback = vi.fn(async () => ({ contextText: "fallback" }));
    const result = await runAttachmentHandlers(files, [], fallback);
    expect(result?.contextText).toBe("fallback");
  });
});

// ─── collectPluginContextProviders ────────────────────────────────────────────

describe("collectPluginContextProviders", () => {
  it("returns base providers when plugins have none", () => {
    const base = [vi.fn()];
    const result = collectPluginContextProviders([makePlugin("p1")], base);
    expect(result).toEqual(base);
  });

  it("appends plugin providers in priority order after base providers", () => {
    const base = [vi.fn()];
    const cp1 = vi.fn();
    const cp2 = vi.fn();
    const low = makePlugin("low", { priority: 0, contextProviders: [cp1] });
    const high = makePlugin("high", { priority: 10, contextProviders: [cp2] });
    const result = collectPluginContextProviders([low, high], base);
    expect(result).toEqual([base[0], cp2, cp1]);
  });
});
