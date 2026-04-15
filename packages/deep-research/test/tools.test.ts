/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createFetchUrlTool, createWebSearchTool } from "../src/tools.js";

describe("deep-research tool adapters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("maps Tavily search results into deep research source candidates", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                title: "OpenAI",
                url: "https://openai.com/research",
                content: "AI research",
                published_date: "2026-04-09",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = createWebSearchTool({
      dataDir: "/tmp/agentrail",
      model: { provider: "mock", modelId: "mock-model" },
      searchProvider: "tavily",
      tavilyApiKey: "tv-key",
    });

    const result = await tool.execute("call-1", { query: "openai" });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.tavily.com/search");
    expect((result.details as { items: Array<{ fetchStatus: string }> }).items[0]).toMatchObject({
      title: "OpenAI",
      fetchStatus: "skipped",
      evidenceLevel: "snippet_only",
    });
  });

  it("selects Brave when configured", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: "OpenAI",
                  url: "https://openai.com",
                  description: "AI research",
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = createWebSearchTool({
      dataDir: "/tmp/agentrail",
      model: { provider: "mock", modelId: "mock-model" },
      searchProvider: "brave",
      braveApiKey: "brave-key",
    });

    await tool.execute("call-2", { query: "openai" });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        "X-Subscription-Token": "brave-key",
      }),
    });
  });

  it("selects Jina when configured", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                title: "OpenAI",
                url: "https://openai.com",
                content: "AI research",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = createWebSearchTool({
      dataDir: "/tmp/agentrail",
      model: { provider: "mock", modelId: "mock-model" },
      searchProvider: "jina",
      jinaApiKey: "jina-key",
    });

    await tool.execute("call-3", { query: "openai" });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: "Bearer jina-key",
      }),
    });
  });

  it("selects Exa when configured", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                title: "OpenAI",
                url: "https://openai.com",
                highlights: ["AI research"],
                publishedDate: "2026-04-09T00:00:00.000Z",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = createWebSearchTool({
      dataDir: "/tmp/agentrail",
      model: { provider: "mock", modelId: "mock-model" },
      searchProvider: "exa",
      exaApiKey: "exa-key",
    });

    const result = await tool.execute("call-exa", { query: "openai" });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.exa.ai/search");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        "x-api-key": "exa-key",
        "x-exa-integration": "agentrail",
      }),
    });
    expect((result.details as { items: Array<{ fetchStatus: string }> }).items[0]).toMatchObject({
      title: "OpenAI",
      fetchStatus: "skipped",
      evidenceLevel: "snippet_only",
    });
  });

  it("maps successful fetches into deep research fetch payloads", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          "<html><head><title>Example</title></head><body><article><h1>Hello</h1></article></body></html>",
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = createFetchUrlTool();
    const result = await tool.execute("call-4", { url: "https://example.com" });

    expect(result.details).toMatchObject({
      fetchStatus: "success",
      evidenceLevel: "body_verified",
      title: "Example",
    });
  });

  it("maps forbidden fetches into the legacy 403 shape", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("forbidden", {
          status: 403,
          headers: { "content-type": "text/plain" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tool = createFetchUrlTool();
    const result = await tool.execute("call-5", { url: "https://forbidden.example.com" });

    expect(result.details).toMatchObject({
      fetchStatus: "403",
      evidenceLevel: "unverified",
    });
  });
});
