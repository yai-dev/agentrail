/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it, vi } from "vitest";
import {
  buildToolInterceptor,
  collectPluginContextProviders,
  runAttachmentHandlers,
  runPluginChatRequestInterceptors,
  runPluginLifecycle,
  runPluginRequestHook,
} from "../src/host/plugins.js";
import type {
  AfterToolCallEvent,
  AgentrailPlugin,
  AgentrailProfileContext,
  AgentrailRequestLifecycleContext,
  AppBeforeToolCallResult,
  BeforeToolCallEvent,
  PluginErrorHandler,
} from "../src/host/types.js";

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
      start: async () => {
        throw error;
      },
    });
    await expect(runPluginLifecycle([plugin], "start", onError)).rejects.toThrow("start failure");
    expect(onError).toHaveBeenCalledWith({ plugin: "bad", hook: "start", error });
  });

  it("stop: notifies onPluginError but continues when a plugin throws", async () => {
    const onError: PluginErrorHandler = vi.fn();
    const order: string[] = [];
    const bad = makePlugin("bad", {
      stop: async () => {
        order.push("bad");
        throw new Error("stop fail");
      },
    });
    const good = makePlugin("good", {
      stop: async () => {
        order.push("good");
      },
    });
    await runPluginLifecycle([bad, good], "stop", onError);
    expect(onError).toHaveBeenCalledOnce();
    expect(order).toEqual(["bad", "good"]);
  });

  it("start: executes in descending priority order", async () => {
    const order: string[] = [];
    const low = makePlugin("low", {
      priority: 0,
      start: async () => {
        order.push("low");
      },
    });
    const high = makePlugin("high", {
      priority: 100,
      start: async () => {
        order.push("high");
      },
    });
    await runPluginLifecycle([low, high], "start");
    expect(order).toEqual(["high", "low"]);
  });

  it("stop: executes in ascending priority order (reverse of start)", async () => {
    const order: string[] = [];
    const low = makePlugin("low", {
      priority: 0,
      stop: async () => {
        order.push("low");
      },
    });
    const high = makePlugin("high", {
      priority: 100,
      stop: async () => {
        order.push("high");
      },
    });
    await runPluginLifecycle([low, high], "stop");
    expect(order).toEqual(["low", "high"]);
  });

  it("uses console.warn by default when no onPluginError is provided", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plugin = makePlugin("bad", {
      stop: async () => {
        throw new Error("oops");
      },
    });
    await runPluginLifecycle([plugin], "stop");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"bad"'), expect.any(Error));
    warn.mockRestore();
  });

  it("safeNotify: falls back to console.error when onPluginError itself throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError: PluginErrorHandler = () => {
      throw new Error("handler failure");
    };
    const plugin = makePlugin("bad", {
      stop: async () => {
        throw new Error("original");
      },
    });
    // Must NOT throw even though both plugin and handler threw
    await expect(runPluginLifecycle([plugin], "stop", onError)).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('"bad"'), expect.any(Error));
    consoleError.mockRestore();
  });

  it("onPluginError may be async: awaited before continuing (no fire-and-forget)", async () => {
    const order: string[] = [];
    const onError: PluginErrorHandler = async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push("handler");
    };
    const bad = makePlugin("bad", {
      stop: async () => {
        order.push("throw");
        throw new Error("err");
      },
    });
    const next = makePlugin("next", {
      stop: async () => {
        order.push("next");
      },
    });
    await runPluginLifecycle([bad, next], "stop", onError);
    expect(order).toEqual(["throw", "handler", "next"]);
  });
});

// ─── runPluginRequestHook ──────────────────────────────────────────────────────

describe("runPluginRequestHook", () => {
  it("calls hook on all plugins", async () => {
    const onRequestStart = vi.fn();
    await runPluginRequestHook(
      [makePlugin("p1", { onRequestStart })],
      "onRequestStart",
      mockRequestContext,
    );
    expect(onRequestStart).toHaveBeenCalledWith(mockRequestContext);
  });

  it("isolates errors: other plugins still run", async () => {
    const onError: PluginErrorHandler = vi.fn();
    const order: string[] = [];
    const bad = makePlugin("bad", {
      onRequestEnd: async () => {
        order.push("bad");
        throw new Error("boom");
      },
    });
    const good = makePlugin("good", {
      onRequestEnd: async () => {
        order.push("good");
      },
    });
    await runPluginRequestHook([bad, good], "onRequestEnd", mockRequestContext, onError);
    expect(onError).toHaveBeenCalledOnce();
    expect(order).toEqual(["bad", "good"]);
  });

  it("runs plugins in descending priority order", async () => {
    const order: string[] = [];
    const low = makePlugin("low", {
      priority: 0,
      onRequestStart: async () => {
        order.push("low");
      },
    });
    const high = makePlugin("high", {
      priority: 10,
      onRequestStart: async () => {
        order.push("high");
      },
    });
    await runPluginRequestHook([low, high], "onRequestStart", mockRequestContext);
    expect(order).toEqual(["high", "low"]);
  });
});

// ─── runPluginChatRequestInterceptors ─────────────────────────────────────────

describe("runPluginChatRequestInterceptors", () => {
  it("returns null when no plugin intercepts", async () => {
    const result = await runPluginChatRequestInterceptors([makePlugin("p1")], mockChatContext);
    expect(result).toBeNull();
  });

  it("returns the first non-null response", async () => {
    const handled = {
      status: 200 as const,
      body: { text: "handled", usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } },
    };
    const plugin = makePlugin("p1", { interceptChatRequest: async () => handled });
    const result = await runPluginChatRequestInterceptors([plugin], mockChatContext);
    expect(result).toBe(handled);
  });

  it("non-critical: isolates errors, notifies onPluginError, continues with null", async () => {
    const onError: PluginErrorHandler = vi.fn();
    const bad = makePlugin("bad", {
      interceptChatRequest: async () => {
        throw new Error("denied");
      },
    });
    const result = await runPluginChatRequestInterceptors([bad], mockChatContext, onError);
    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledWith({
      plugin: "bad",
      hook: "interceptChatRequest",
      error: expect.any(Error),
    });
  });

  it("critical: notifies onPluginError then rethrows", async () => {
    const onError: PluginErrorHandler = vi.fn();
    const error = new Error("auth failure");
    const bad = makePlugin("bad", {
      critical: true,
      interceptChatRequest: async () => {
        throw error;
      },
    });
    await expect(runPluginChatRequestInterceptors([bad], mockChatContext, onError)).rejects.toThrow(
      "auth failure",
    );
    expect(onError).toHaveBeenCalledWith({ plugin: "bad", hook: "interceptChatRequest", error });
  });

  it("runs plugins in descending priority order", async () => {
    const order: string[] = [];
    const low = makePlugin("low", {
      priority: 0,
      interceptChatRequest: async () => {
        order.push("low");
        return null;
      },
    });
    const high = makePlugin("high", {
      priority: 5,
      interceptChatRequest: async () => {
        order.push("high");
        return null;
      },
    });
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
    const bad = makePlugin("bad", {
      attachmentHandler: async () => {
        throw new Error("fail");
      },
    });
    const good = makePlugin("good", { attachmentHandler: async () => ({ contextText: "ok" }) });
    const result = await runAttachmentHandlers(files, [bad, good], undefined, onError);
    expect(result?.contextText).toBe("ok");
    expect(onError).toHaveBeenCalledWith({
      plugin: "bad",
      hook: "attachmentHandler",
      error: expect.any(Error),
    });
  });

  it("includes fallbackHandler result", async () => {
    const fallback = vi.fn(async () => ({ contextText: "fallback" }));
    const result = await runAttachmentHandlers(files, [], fallback);
    expect(result?.contextText).toBe("fallback");
  });
});

// ─── buildToolInterceptor ─────────────────────────────────────────────────────

const mockProfileCtx: AgentrailProfileContext = {
  tenantId: "t1",
  userId: "u1",
  sessionId: "s1",
  sessionRef: {
    tenantId: "t1",
    userId: "u1",
    sessionId: "s1",
  } as AgentrailProfileContext["sessionRef"],
  sessionStore: {} as AgentrailProfileContext["sessionStore"],
};

function makeToolPlugin(
  name: string,
  overrides: Pick<AgentrailPlugin, "priority" | "onBeforeToolCall" | "onAfterToolCall"> & {
    priority?: number;
  },
): AgentrailPlugin {
  return { name, ...overrides };
}

function makeBeforeEvent(
  toolName = "test",
  input: Record<string, unknown> = { value: "x" },
): BeforeToolCallEvent {
  return { toolName, input, context: mockProfileCtx };
}

describe("buildToolInterceptor", () => {
  // ── Non-object input guard ──────────────────────────────────────────────────

  it("skips onBeforeToolCall hooks when input is an array (not a plain object)", async () => {
    const hook = vi.fn().mockResolvedValue({ action: "allow" });
    const plugin = makeToolPlugin("p1", { onBeforeToolCall: hook });
    const interceptor = buildToolInterceptor([plugin], mockProfileCtx)!;
    const result = await interceptor.onBeforeToolCall!({ toolName: "t", input: ["a", "b"] });
    expect(hook).not.toHaveBeenCalled();
    expect(result).toMatchObject({ action: "allow" });
  });

  it("skips onBeforeToolCall hooks when input is a primitive", async () => {
    const hook = vi.fn().mockResolvedValue({ action: "allow" });
    const plugin = makeToolPlugin("p1", { onBeforeToolCall: hook });
    const interceptor = buildToolInterceptor([plugin], mockProfileCtx)!;
    const result = await interceptor.onBeforeToolCall!({ toolName: "t", input: 42 });
    expect(hook).not.toHaveBeenCalled();
    expect(result).toMatchObject({ action: "allow" });
  });

  it("skips onAfterToolCall hooks when input is an array", async () => {
    const hook = vi.fn();
    const plugin = makeToolPlugin("p1", { onAfterToolCall: hook });
    const interceptor = buildToolInterceptor([plugin], mockProfileCtx)!;
    await interceptor.onAfterToolCall!({
      toolName: "t",
      input: ["a", "b"],
      result: {},
      durationMs: 0,
    });
    expect(hook).not.toHaveBeenCalled();
  });

  it("skips onAfterToolCall hooks when input is null", async () => {
    const hook = vi.fn();
    const plugin = makeToolPlugin("p1", { onAfterToolCall: hook });
    const interceptor = buildToolInterceptor([plugin], mockProfileCtx)!;
    await interceptor.onAfterToolCall!({ toolName: "t", input: null, result: {}, durationMs: 0 });
    expect(hook).not.toHaveBeenCalled();
  });

  it("still calls hooks normally for plain-object inputs", async () => {
    const hook = vi.fn().mockResolvedValue({ action: "allow" });
    const plugin = makeToolPlugin("p1", { onBeforeToolCall: hook });
    const interceptor = buildToolInterceptor([plugin], mockProfileCtx)!;
    await interceptor.onBeforeToolCall!({ toolName: "t", input: { value: "x" } });
    expect(hook).toHaveBeenCalledOnce();
  });

  // ── Other buildToolInterceptor tests ────────────────────────────────────────

  it("returns undefined when no plugin implements either hook", () => {
    const interceptor = buildToolInterceptor([makePlugin("p1"), makePlugin("p2")], mockProfileCtx);
    expect(interceptor).toBeUndefined();
  });

  it("returns a ToolInterceptor when at least one plugin has a hook", () => {
    const plugin = makeToolPlugin("p1", {
      onBeforeToolCall: vi.fn().mockResolvedValue({ action: "allow" }),
    });
    const interceptor = buildToolInterceptor([plugin], mockProfileCtx);
    expect(interceptor).toBeDefined();
    expect(interceptor?.onBeforeToolCall).toBeDefined();
  });

  it("uses defaultErrorHandler when onError is omitted (no throw)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plugin = makeToolPlugin("bad", {
      onBeforeToolCall: vi.fn().mockRejectedValue(new Error("boom")),
    });
    const interceptor = buildToolInterceptor([plugin], mockProfileCtx);
    // Should not throw; error should be swallowed via defaultErrorHandler → console.warn
    await expect(
      interceptor!.onBeforeToolCall!({ toolName: "t", input: {} }),
    ).resolves.toMatchObject({ action: "allow" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  describe("onBeforeToolCall composition", () => {
    it("runs plugins in descending priority order", async () => {
      const order: string[] = [];
      const low = makeToolPlugin("low", {
        priority: 0,
        onBeforeToolCall: vi.fn().mockImplementation(async () => {
          order.push("low");
          return { action: "allow" };
        }),
      });
      const high = makeToolPlugin("high", {
        priority: 10,
        onBeforeToolCall: vi.fn().mockImplementation(async () => {
          order.push("high");
          return { action: "allow" };
        }),
      });
      const interceptor = buildToolInterceptor([low, high], mockProfileCtx)!;
      await interceptor.onBeforeToolCall!({ toolName: "t", input: {} });
      expect(order).toEqual(["high", "low"]);
    });

    it("first-deny-wins: subsequent plugins are skipped", async () => {
      const second = vi.fn().mockResolvedValue({ action: "allow" });
      const first = makeToolPlugin("first", {
        priority: 10,
        onBeforeToolCall: vi.fn().mockResolvedValue({ action: "deny", reason: "no" }),
      });
      const secondPlugin = makeToolPlugin("second", {
        priority: 0,
        onBeforeToolCall: second,
      });
      const interceptor = buildToolInterceptor([first, secondPlugin], mockProfileCtx)!;
      const result = await interceptor.onBeforeToolCall!({ toolName: "t", input: {} });
      expect(result).toMatchObject({ action: "deny", reason: "no" });
      expect(second).not.toHaveBeenCalled();
    });

    it("modified input is forwarded to the next plugin and returned", async () => {
      const received: Record<string, unknown>[] = [];
      const first = makeToolPlugin("first", {
        priority: 10,
        onBeforeToolCall: vi
          .fn()
          .mockResolvedValue({ action: "allow", input: { value: "modified" } }),
      });
      const second = makeToolPlugin("second", {
        priority: 0,
        onBeforeToolCall: vi.fn().mockImplementation(async (ev: BeforeToolCallEvent) => {
          received.push(ev.input);
          return { action: "allow" as const };
        }),
      });
      const interceptor = buildToolInterceptor([first, second], mockProfileCtx)!;
      const result = (await interceptor.onBeforeToolCall!({
        toolName: "t",
        input: { value: "original" },
      })) as AppBeforeToolCallResult & { input?: Record<string, unknown> };
      expect(received[0].value).toBe("modified");
      expect(result).toMatchObject({ action: "allow", input: { value: "modified" } });
    });

    it("each plugin receives a fresh shallow copy of input, not the same reference", async () => {
      const receivedRefs: Record<string, unknown>[] = [];
      const mutatingPlugin = makeToolPlugin("mutator", {
        priority: 10,
        onBeforeToolCall: vi.fn().mockImplementation(async (ev: BeforeToolCallEvent) => {
          receivedRefs.push(ev.input);
          // In-place mutation — should NOT affect the next plugin's input.
          (ev.input as Record<string, unknown>).injected = true;
          return { action: "allow" as const };
        }),
      });
      const observerPlugin = makeToolPlugin("observer", {
        priority: 0,
        onBeforeToolCall: vi.fn().mockImplementation(async (ev: BeforeToolCallEvent) => {
          receivedRefs.push(ev.input);
          return { action: "allow" as const };
        }),
      });
      const interceptor = buildToolInterceptor([mutatingPlugin, observerPlugin], mockProfileCtx)!;
      await interceptor.onBeforeToolCall!({ toolName: "t", input: { value: "x" } });

      // Both plugins should have received distinct object references.
      expect(receivedRefs[0]).not.toBe(receivedRefs[1]);
      // The mutation by the first plugin should NOT appear in the second plugin's input.
      expect(receivedRefs[1].injected).toBeUndefined();
    });

    it("plugin throw: safeNotify called, execution continues to next plugin (not deny)", async () => {
      const onError: PluginErrorHandler = vi.fn();
      const bad = makeToolPlugin("bad", {
        priority: 10,
        onBeforeToolCall: vi.fn().mockRejectedValue(new Error("boom")),
      });
      const good = makeToolPlugin("good", {
        priority: 0,
        onBeforeToolCall: vi.fn().mockResolvedValue({ action: "allow" }),
      });
      const interceptor = buildToolInterceptor([bad, good], mockProfileCtx, onError)!;
      const result = await interceptor.onBeforeToolCall!({ toolName: "t", input: {} });
      expect(result).toMatchObject({ action: "allow" });
      expect(onError).toHaveBeenCalledWith({
        plugin: "bad",
        hook: "onBeforeToolCall",
        error: expect.any(Error),
      });
      expect(good.onBeforeToolCall).toHaveBeenCalledOnce();
    });
  });

  describe("onAfterToolCall composition", () => {
    it("runs plugins in descending priority order", async () => {
      const order: string[] = [];
      const low = makeToolPlugin("low", {
        priority: 0,
        onAfterToolCall: vi.fn().mockImplementation(async () => {
          order.push("low");
        }),
      });
      const high = makeToolPlugin("high", {
        priority: 10,
        onAfterToolCall: vi.fn().mockImplementation(async () => {
          order.push("high");
        }),
      });
      const interceptor = buildToolInterceptor([low, high], mockProfileCtx)!;
      const ctx: Parameters<NonNullable<typeof interceptor.onAfterToolCall>>[0] = {
        toolName: "t",
        input: {},
        result: {},
        durationMs: 0,
      };
      await interceptor.onAfterToolCall!(ctx);
      expect(order).toEqual(["high", "low"]);
    });

    it("each plugin receives a fresh shallow copy of input", async () => {
      const receivedRefs: Record<string, unknown>[] = [];
      const plugin1 = makeToolPlugin("p1", {
        priority: 10,
        onAfterToolCall: vi.fn().mockImplementation(async (ev: AfterToolCallEvent) => {
          receivedRefs.push(ev.input);
          (ev.input as Record<string, unknown>).mutated = true;
        }),
      });
      const plugin2 = makeToolPlugin("p2", {
        priority: 0,
        onAfterToolCall: vi.fn().mockImplementation(async (ev: AfterToolCallEvent) => {
          receivedRefs.push(ev.input);
        }),
      });
      const interceptor = buildToolInterceptor([plugin1, plugin2], mockProfileCtx)!;
      await interceptor.onAfterToolCall!({
        toolName: "t",
        input: { value: "x" },
        result: {},
        durationMs: 0,
      });

      expect(receivedRefs[0]).not.toBe(receivedRefs[1]);
      expect(receivedRefs[1].mutated).toBeUndefined();
    });

    it("plugin throw: safeNotify called, other plugins still run", async () => {
      const onError: PluginErrorHandler = vi.fn();
      const order: string[] = [];
      const bad = makeToolPlugin("bad", {
        priority: 10,
        onAfterToolCall: vi.fn().mockRejectedValue(new Error("after fail")),
      });
      const good = makeToolPlugin("good", {
        priority: 0,
        onAfterToolCall: vi.fn().mockImplementation(async () => {
          order.push("good");
        }),
      });
      const interceptor = buildToolInterceptor([bad, good], mockProfileCtx, onError)!;
      const ctx: Parameters<NonNullable<typeof interceptor.onAfterToolCall>>[0] = {
        toolName: "t",
        input: {},
        result: {},
        durationMs: 0,
      };
      await interceptor.onAfterToolCall!(ctx);
      expect(onError).toHaveBeenCalledWith({
        plugin: "bad",
        hook: "onAfterToolCall",
        error: expect.any(Error),
      });
      expect(order).toEqual(["good"]);
    });

    it("passes correct AfterToolCallEvent fields to plugin hooks", async () => {
      const receivedEvents: AfterToolCallEvent[] = [];
      const plugin = makeToolPlugin("p1", {
        onAfterToolCall: vi.fn().mockImplementation(async (ev: AfterToolCallEvent) => {
          receivedEvents.push(ev);
        }),
      });
      const interceptor = buildToolInterceptor([plugin], mockProfileCtx)!;
      const ctx: Parameters<NonNullable<typeof interceptor.onAfterToolCall>>[0] = {
        toolName: "myTool",
        input: { key: "val" },
        result: { content: [] },
        durationMs: 42,
      };
      await interceptor.onAfterToolCall!(ctx);
      expect(receivedEvents[0].toolName).toBe("myTool");
      expect(receivedEvents[0].durationMs).toBe(42);
      expect(receivedEvents[0].context).toBe(mockProfileCtx);
    });
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
