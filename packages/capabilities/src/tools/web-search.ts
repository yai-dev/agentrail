/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { tool } from "@agentrail/core";
import { Type } from "@sinclair/typebox";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_LIMIT = 10;

export interface WebSearchOptions {
  maxResults?: number;
  signal?: AbortSignal;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
}

export interface WebSearchProvider {
  search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]>;
}

export interface WebSearchToolOptions {
  maxResultsDefault?: number;
  maxResultsLimit?: number;
}

export interface TavilySearchProviderOptions {
  apiKey: string;
  timeoutMs?: number;
}

export interface BraveSearchProviderOptions {
  apiKey: string;
  timeoutMs?: number;
}

export interface JinaSearchProviderOptions {
  apiKey?: string;
  timeoutMs?: number;
}

interface TavilySearchResult {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
}

interface BraveSearchResult {
  title?: string;
  url?: string;
  description?: string;
  page_age?: string;
}

interface JinaSearchResult {
  title?: string;
  url?: string;
  content?: string;
  description?: string;
  snippet?: string;
  publishedAt?: string;
  published_at?: string;
}

function createTimedSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function sanitizeSearchResult(result: WebSearchResult): WebSearchResult | null {
  if (!result.url) {
    return null;
  }

  return {
    title: normalizeWhitespace(result.title || result.url) || result.url,
    url: result.url,
    snippet: normalizeWhitespace(result.snippet),
    ...(result.publishedAt ? { publishedAt: result.publishedAt } : {}),
  };
}

/** Creates a provider-backed generic web search tool. */
export function createWebSearchTool(
  provider: WebSearchProvider,
  options: WebSearchToolOptions = {},
) {
  const maxResultsDefault = options.maxResultsDefault ?? DEFAULT_MAX_RESULTS;
  const maxResultsLimit = options.maxResultsLimit ?? MAX_RESULTS_LIMIT;

  return tool()
    .name("WebSearch")
    .label("WebSearch")
    .description("Search the web and return normalized result candidates.")
    .parameters(
      Type.Object({
        query: Type.String({ description: "Search query." }),
        max_results: Type.Optional(
          Type.Integer({
            minimum: 1,
            maximum: maxResultsLimit,
            default: maxResultsDefault,
            description: "Maximum number of results to return.",
          }),
        ),
      }),
    )
    .execute(async ({ query, max_results }, ctx) => {
      const results = await provider.search(query, {
        maxResults: max_results ?? maxResultsDefault,
        signal: ctx.signal,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
        details: { results },
      };
    })
    .build();
}

/** Creates a Tavily-backed search provider adapter. */
export function createTavilySearchProvider(
  options: TavilySearchProviderOptions,
): WebSearchProvider {
  return {
    async search(query, searchOptions = {}) {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: options.apiKey,
          query,
          max_results: searchOptions.maxResults ?? DEFAULT_MAX_RESULTS,
          search_depth: "advanced",
          include_answer: false,
          include_raw_content: false,
          include_images: false,
        }),
        signal: createTimedSignal(searchOptions.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Tavily search failed with status ${response.status}`);
      }

      const data = (await response.json()) as { results?: TavilySearchResult[] };
      return (data.results ?? [])
        .map((item) =>
          sanitizeSearchResult({
            title: item.title ?? item.url ?? "Untitled",
            url: item.url ?? "",
            snippet: item.content ?? "",
            publishedAt: item.published_date,
          }),
        )
        .filter((item): item is WebSearchResult => Boolean(item));
    },
  };
}

/** Creates a Brave-backed search provider adapter. */
export function createBraveSearchProvider(
  options: BraveSearchProviderOptions,
): WebSearchProvider {
  return {
    async search(query, searchOptions = {}) {
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", String(searchOptions.maxResults ?? DEFAULT_MAX_RESULTS));

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": options.apiKey,
        },
        signal: createTimedSignal(searchOptions.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Brave search failed with status ${response.status}`);
      }

      const data = (await response.json()) as { web?: { results?: BraveSearchResult[] } };
      return (data.web?.results ?? [])
        .map((item) =>
          sanitizeSearchResult({
            title: item.title ?? item.url ?? "Untitled",
            url: item.url ?? "",
            snippet: item.description ?? "",
            publishedAt: item.page_age,
          }),
        )
        .filter((item): item is WebSearchResult => Boolean(item));
    },
  };
}

function coerceJinaResults(payload: unknown): JinaSearchResult[] {
  if (Array.isArray(payload)) {
    return payload as JinaSearchResult[];
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) return record.data as JinaSearchResult[];
    if (Array.isArray(record.results)) return record.results as JinaSearchResult[];
    if (Array.isArray(record.items)) return record.items as JinaSearchResult[];
  }
  return [];
}

/** Creates a Jina-backed search provider adapter. */
export function createJinaSearchProvider(
  options: JinaSearchProviderOptions = {},
): WebSearchProvider {
  return {
    async search(query, searchOptions = {}) {
      const url = new URL("https://s.jina.ai/");
      url.searchParams.set("q", query);
      url.searchParams.set("num", String(searchOptions.maxResults ?? DEFAULT_MAX_RESULTS));

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-Respond-With": "no-content",
          ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
        },
        signal: createTimedSignal(searchOptions.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Jina search failed with status ${response.status}`);
      }

      const data = coerceJinaResults(await response.json());
      return data
        .map((item) =>
          sanitizeSearchResult({
            title: item.title ?? item.url ?? "Untitled",
            url: item.url ?? "",
            snippet: item.content ?? item.description ?? item.snippet ?? "",
            publishedAt: item.publishedAt ?? item.published_at,
          }),
        )
        .filter((item): item is WebSearchResult => Boolean(item));
    },
  };
}
