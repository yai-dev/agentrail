/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { tool, Type } from "@agentrail/core";
import type { DeepResearchRuntimeConfig } from "@/runtime.js";
import { normalizeResearchUrl } from "@/utils.js";

interface TavilySearchResult {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
}

interface WebSearchItem {
  title: string;
  url: string;
  normalizedUrl: string;
  snippet: string;
  domain: string;
  publishedAt?: string;
  evidenceLevel: "snippet_only";
  fetchStatus: "skipped";
}

// Tool outputs are normalized here so sub-agents only have to reason about one
// predictable schema, regardless of the upstream provider response.
function getDomain(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "";
  }
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripHtml(html: string): string {
  return normalizeWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">"),
  );
}

export function createWebSearchTool(runtime: DeepResearchRuntimeConfig) {
  return tool()
    .name("WebSearch")
    .label("WebSearch")
    .description("Search the web using Tavily and return normalized source candidates.")
    .parameters(
      Type.Object({
        query: Type.String({ description: "Search query." }),
        max_results: Type.Optional(
          Type.Integer({
            minimum: 1,
            maximum: 10,
            default: 5,
            description: "Maximum number of results to return.",
          }),
        ),
      }),
    )
    .execute(async ({ query, max_results }) => {
      if (runtime.searchProvider !== "tavily" || !runtime.tavilyApiKey) {
        throw new Error(
          "Deep Research search is not configured. Set search.provider=tavily and search.tavilyApiKey in config/agentrail.yaml.",
        );
      }

      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: runtime.tavilyApiKey,
          query,
          max_results: max_results ?? 5,
          search_depth: "advanced",
          include_answer: false,
          include_raw_content: false,
          include_images: false,
        }),
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        throw new Error(`Tavily search failed with status ${response.status}`);
      }

      const data = (await response.json()) as { results?: TavilySearchResult[] };
      const items: WebSearchItem[] = (data.results ?? [])
        .filter(
          (
            item,
          ): item is Required<Pick<TavilySearchResult, "title" | "url">> & TavilySearchResult =>
            !!item.url && !!item.title,
        )
        .map((item) => ({
          title: item.title ?? item.url ?? "Untitled",
          url: normalizeResearchUrl(item.url ?? ""),
          normalizedUrl: normalizeResearchUrl(item.url ?? ""),
          snippet: normalizeWhitespace(item.content ?? "").slice(0, 500),
          domain: getDomain(normalizeResearchUrl(item.url ?? "")),
          publishedAt: item.published_date,
          evidenceLevel: "snippet_only" as const,
          fetchStatus: "skipped" as const,
        }))
        .filter((item) => item.url);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }],
        details: { items },
      };
    })
    .build();
}

export function createFetchUrlTool() {
  return tool()
    .name("FetchUrl")
    .label("FetchUrl")
    .description("Fetch a URL and extract readable text content for research citation.")
    .parameters(
      Type.Object({
        url: Type.String({ description: "HTTP or HTTPS URL to fetch." }),
      }),
    )
    .execute(async ({ url }) => {
      // FetchUrl returns structured failures instead of throwing for common HTTP
      // outcomes. That gives the researcher enough information to decide
      // whether to retry, downgrade evidence, or stop hitting a blocked domain.
      const normalizedUrl = normalizeResearchUrl(url);
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        throw new Error("FetchUrl only supports http/https URLs");
      }

      let payload: {
        url: string;
        normalizedUrl: string;
        title: string;
        content: string;
        evidenceLevel: "body_verified" | "unverified";
        fetchStatus: "success" | "401" | "403" | "timeout" | "empty_content" | "error";
        error?: string;
      };

      try {
        const response = await fetch(normalizedUrl, {
          headers: {
            "User-Agent": "Agentrail-DeepResearch/1.0",
            Accept: "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(20_000),
        });

        if (!response.ok) {
          const fetchStatus =
            response.status === 401 ? "401" : response.status === 403 ? "403" : "error";
          payload = {
            url: normalizedUrl,
            normalizedUrl,
            title: normalizedUrl,
            content: "",
            evidenceLevel: "unverified",
            fetchStatus,
            error: `FetchUrl failed with status ${response.status}`,
          };
        } else {
          const html = await response.text();
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const title = titleMatch?.[1] ? normalizeWhitespace(titleMatch[1]) : normalizedUrl;
          const content = stripHtml(html).slice(0, 8000);
          payload = {
            url: normalizedUrl,
            normalizedUrl,
            title,
            content,
            evidenceLevel: content ? "body_verified" : "unverified",
            fetchStatus: content ? "success" : "empty_content",
            ...(content ? {} : { error: "Fetched page but extracted content was empty" }),
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        payload = {
          url: normalizedUrl,
          normalizedUrl,
          title: normalizedUrl,
          content: "",
          evidenceLevel: "unverified",
          fetchStatus: /timed out/i.test(message) ? "timeout" : "error",
          error: message,
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        details: payload,
      };
    })
    .build();
}
