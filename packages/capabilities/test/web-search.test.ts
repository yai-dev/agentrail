/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBraveSearchProvider,
  createExaSearchProvider,
  createJinaSearchProvider,
  createTavilySearchProvider,
  createWebSearchTool,
} from "../src/tools/web-search.js";

describe("createWebSearchTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns provider results as structured details", async () => {
    const provider = {
      search: vi.fn(async () => [
        { title: "OpenAI", url: "https://openai.com", snippet: "AI research." },
      ]),
    };

    const tool = createWebSearchTool(provider);
    const result = await tool.execute("call-1", { query: "openai" });

    expect(provider.search).toHaveBeenCalledWith("openai", {
      maxResults: 5,
      signal: undefined,
    });
    expect(result.details).toEqual({
      results: [{ title: "OpenAI", url: "https://openai.com", snippet: "AI research." }],
    });
  });

  it("maps Tavily responses into generic search results", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                title: "OpenAI",
                url: "https://openai.com",
                content: "AI research and products",
                published_date: "2026-04-09",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createTavilySearchProvider({ apiKey: "tv-key" });
    const results = await provider.search("openai", { maxResults: 3 });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.tavily.com/search");
    expect(results).toEqual([
      {
        title: "OpenAI",
        url: "https://openai.com",
        snippet: "AI research and products",
        publishedAt: "2026-04-09",
      },
    ]);
  });

  it("maps Brave responses into generic search results", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: "OpenAI",
                  url: "https://openai.com",
                  description: "AI research and deployment company",
                  page_age: "2026-04-09",
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createBraveSearchProvider({ apiKey: "brave-key" });
    const results = await provider.search("openai");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        "X-Subscription-Token": "brave-key",
      }),
    });
    expect(results).toEqual([
      {
        title: "OpenAI",
        url: "https://openai.com",
        snippet: "AI research and deployment company",
        publishedAt: "2026-04-09",
      },
    ]);
  });

  it("maps Exa responses into generic search results", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                title: "OpenAI",
                url: "https://openai.com",
                highlights: ["AI research and deployment"],
                summary: "AI research organization",
                publishedDate: "2026-04-09T00:00:00.000Z",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createExaSearchProvider({ apiKey: "exa-key" });
    const results = await provider.search("openai", { maxResults: 3 });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.exa.ai/search");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        "x-api-key": "exa-key",
        "x-exa-integration": "agentrail",
      }),
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      query: "openai",
      numResults: 3,
      type: "auto",
      contents: {
        text: { maxCharacters: 500 },
        highlights: { maxCharacters: 200 },
        summary: true,
      },
    });
    expect(results).toEqual([
      {
        title: "OpenAI",
        url: "https://openai.com",
        snippet: "AI research and deployment",
        publishedAt: "2026-04-09T00:00:00.000Z",
      },
    ]);
  });

  it("falls back to summary, then text, when Exa highlights are missing", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                title: "Summary only",
                url: "https://example.com/a",
                summary: "Summary snippet",
              },
              {
                title: "Text only",
                url: "https://example.com/b",
                text: "Full text snippet",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createExaSearchProvider({ apiKey: "exa-key" });
    const results = await provider.search("fallback");

    expect(results).toEqual([
      { title: "Summary only", url: "https://example.com/a", snippet: "Summary snippet" },
      { title: "Text only", url: "https://example.com/b", snippet: "Full text snippet" },
    ]);
  });

  it("forwards Exa filter options through the request body", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createExaSearchProvider({
      apiKey: "exa-key",
      searchType: "neural",
      category: "research paper",
      includeDomains: ["arxiv.org"],
      excludeDomains: ["spam.example"],
      startPublishedDate: "2025-01-01",
      userLocation: "US",
    });
    await provider.search("agents");

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      query: "agents",
      type: "neural",
      category: "research paper",
      includeDomains: ["arxiv.org"],
      excludeDomains: ["spam.example"],
      startPublishedDate: "2025-01-01",
      userLocation: "US",
    });
  });

  it("throws when the Exa API returns a non-2xx status", async () => {
    const fetchMock = vi.fn(
      async () => new Response("boom", { status: 500, headers: { "content-type": "text/plain" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createExaSearchProvider({ apiKey: "exa-key" });
    await expect(provider.search("openai")).rejects.toThrow(/status 500/);
  });

  it("maps Jina responses into generic search results", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                title: "OpenAI",
                url: "https://openai.com",
                content: "Search snippet",
                publishedAt: "2026-04-09",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createJinaSearchProvider({ apiKey: "jina-key" });
    const results = await provider.search("openai");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: "Bearer jina-key",
        "X-Respond-With": "no-content",
      }),
    });
    expect(results).toEqual([
      {
        title: "OpenAI",
        url: "https://openai.com",
        snippet: "Search snippet",
        publishedAt: "2026-04-09",
      },
    ]);
  });
});
