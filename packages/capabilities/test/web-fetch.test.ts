/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebFetchTool } from "../src/tools/web-fetch.js";

describe("createWebFetchTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("converts HTML into readable markdown", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          "<html><head><title>Example</title></head><body><article><h1>Hello</h1><p>World</p></article></body></html>",
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = createWebFetchTool();
    const result = await tool.execute("call-1", { url: "https://example.com" });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("# Hello"),
    });
    expect(result.details).toMatchObject({
      status: "success",
      title: "Example",
      extracted: false,
    });
  });

  it("upgrades http URLs to https before fetching", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("plain text", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = createWebFetchTool();
    await tool.execute("call-2", { url: "http://example.com/page" });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.com/page");
  });

  it("reuses the page cache for repeated fetches", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("<html><body><article><p>cached page</p></article></body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = createWebFetchTool();
    await tool.execute("call-3", { url: "https://cache.example.com/page" });
    const result = await tool.execute("call-4", { url: "https://cache.example.com/page" });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.details).toMatchObject({
      status: "success",
      fromPageCache: true,
    });
  });

  it("reuses extraction cache for repeated query extraction", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("<html><body><article><p>OpenAI builds models.</p></article></body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const extractionClient = {
      extract: vi.fn(async () => ({ content: "OpenAI builds models." })),
    };

    const tool = createWebFetchTool({ extractionClient });
    await tool.execute("call-5", {
      url: "https://extract.example.com/page",
      query: "What does the page say?",
    });
    const result = await tool.execute("call-6", {
      url: "https://extract.example.com/page",
      query: "What does the page say?",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(extractionClient.extract).toHaveBeenCalledOnce();
    expect(result.details).toMatchObject({
      status: "success",
      extracted: true,
      fromExtractionCache: true,
    });
  });

  it("returns a clear error when query extraction is requested without a client", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const tool = createWebFetchTool();
    const result = await tool.execute("call-7", {
      url: "https://example.com",
      query: "Summarize this page",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      status: "error",
      error: expect.stringContaining("extractionClient"),
    });
  });

  it("does not cache HTTP failures", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("forbidden", { status: 403, headers: { "content-type": "text/plain" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = createWebFetchTool();
    await tool.execute("call-8", { url: "https://errors.example.com/page" });
    const result = await tool.execute("call-9", { url: "https://errors.example.com/page" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.details).toMatchObject({
      status: "http_error",
      httpStatus: 403,
      fromPageCache: false,
    });
  });
});
