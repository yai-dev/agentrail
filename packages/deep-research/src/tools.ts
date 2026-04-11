/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { DeepResearchRuntimeConfig } from "@/runtime.js";
import { normalizeResearchUrl } from "@/utils.js";
import {
  createBraveSearchProvider,
  createWebFetchTool as createGenericWebFetchTool,
  createWebSearchTool as createGenericWebSearchTool,
  createJinaSearchProvider,
  createTavilySearchProvider,
  type WebFetchDetails,
  type WebSearchProvider,
} from "@agentrail/capabilities";
import { tool, Type } from "@agentrail/core";

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

function resolveSearchProvider(runtime: DeepResearchRuntimeConfig): WebSearchProvider {
  if (runtime.searchProvider === "tavily" && runtime.tavilyApiKey) {
    return createTavilySearchProvider({ apiKey: runtime.tavilyApiKey });
  }

  if (runtime.searchProvider === "brave" && runtime.braveApiKey) {
    return createBraveSearchProvider({ apiKey: runtime.braveApiKey });
  }

  if (runtime.searchProvider === "jina" && runtime.jinaApiKey) {
    return createJinaSearchProvider({ apiKey: runtime.jinaApiKey });
  }

  throw new Error(
    "Deep Research search is not configured. Set search.provider and its matching API key in config/agentrail.yaml.",
  );
}

function mapFetchStatus(
  details: WebFetchDetails,
): "success" | "401" | "403" | "timeout" | "empty_content" | "error" {
  if (details.status === "success") return "success";
  if (details.status === "timeout") return "timeout";
  if (details.status === "empty_content") return "empty_content";
  if (details.status === "http_error") {
    if (details.httpStatus === 401) return "401";
    if (details.httpStatus === 403) return "403";
  }
  return "error";
}

export function createWebSearchTool(runtime: DeepResearchRuntimeConfig) {
  const baseTool = createGenericWebSearchTool(resolveSearchProvider(runtime));

  return tool()
    .name("WebSearch")
    .label("WebSearch")
    .description("Search the web and return normalized source candidates.")
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
    .execute(async ({ query, max_results }, ctx) => {
      const baseResult = await baseTool.execute(
        ctx.toolCallId,
        { query, max_results },
        ctx.signal,
        ctx.onUpdate,
        ctx.onSignal,
      );

      const rawResults =
        (
          baseResult.details as {
            results?: Array<{
              title?: string;
              url?: string;
              snippet?: string;
              publishedAt?: string;
            }>;
          }
        ).results ?? [];

      const items: WebSearchItem[] = rawResults
        .map((item) => {
          const normalizedUrl = normalizeResearchUrl(item.url ?? "");
          return {
            title: item.title ?? item.url ?? "Untitled",
            url: normalizedUrl,
            normalizedUrl,
            snippet: normalizeWhitespace(item.snippet ?? "").slice(0, 500),
            domain: getDomain(normalizedUrl),
            publishedAt: item.publishedAt,
            evidenceLevel: "snippet_only" as const,
            fetchStatus: "skipped" as const,
          };
        })
        .filter((item) => item.url);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }],
        details: { items },
      };
    })
    .build();
}

export function createFetchUrlTool() {
  const baseTool = createGenericWebFetchTool();

  return tool()
    .name("FetchUrl")
    .label("FetchUrl")
    .description("Fetch a URL and extract readable text content for research citation.")
    .parameters(
      Type.Object({
        url: Type.String({ description: "HTTP or HTTPS URL to fetch." }),
      }),
    )
    .execute(async ({ url }, ctx) => {
      const normalizedUrl = normalizeResearchUrl(url);
      const baseResult = await baseTool.execute(
        ctx.toolCallId,
        { url: normalizedUrl },
        ctx.signal,
        ctx.onUpdate,
        ctx.onSignal,
      );
      const details = baseResult.details as WebFetchDetails;

      const payload: {
        url: string;
        normalizedUrl: string;
        title: string;
        content: string;
        evidenceLevel: "body_verified" | "unverified";
        fetchStatus: "success" | "401" | "403" | "timeout" | "empty_content" | "error";
        error?: string;
      } = {
        url: normalizedUrl,
        normalizedUrl,
        title: details.status === "success" ? details.title : details.title || normalizedUrl,
        content: details.status === "success" ? details.content : "",
        evidenceLevel:
          details.status === "success" && details.content ? "body_verified" : "unverified",
        fetchStatus: mapFetchStatus(details),
        ...(details.status === "success" ? {} : { error: details.error }),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        details: payload,
      };
    })
    .build();
}
