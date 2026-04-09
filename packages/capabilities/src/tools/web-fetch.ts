/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { tool } from "@agentrail/core";
import { Type } from "@sinclair/typebox";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_CHARS = 50_000;
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type CachedPage = {
  finalUrl: string;
  title: string;
  markdown: string;
};

type CachedExtraction = {
  content: string;
  details?: unknown;
};

const pageCache = new Map<string, CacheEntry<CachedPage>>();
const extractionCache = new Map<string, CacheEntry<CachedExtraction>>();

export interface WebFetchExtractionRequest {
  url: string;
  title: string;
  markdown: string;
  query: string;
  signal?: AbortSignal;
}

export interface WebFetchExtractionResponse {
  content: string;
  details?: unknown;
}

export interface WebFetchExtractionClient {
  extract(input: WebFetchExtractionRequest): Promise<WebFetchExtractionResponse>;
}

export interface WebFetchToolOptions {
  extractionClient?: WebFetchExtractionClient;
  maxResponseChars?: number;
  timeoutMs?: number;
  trustedDomains?: string[];
}

export type WebFetchStatus = "success" | "http_error" | "timeout" | "empty_content" | "error";

export type WebFetchDetails =
  | {
      status: "success";
      requestedUrl: string;
      finalUrl: string;
      title: string;
      content: string;
      markdown: string;
      extracted: boolean;
      query?: string;
      fromPageCache: boolean;
      fromExtractionCache: boolean;
      wasTruncated: boolean;
      extractionDetails?: unknown;
    }
  | {
      status: "http_error" | "timeout" | "empty_content" | "error";
      requestedUrl: string;
      finalUrl?: string;
      title: string;
      content: string;
      markdown: string;
      extracted: boolean;
      query?: string;
      fromPageCache: boolean;
      fromExtractionCache: boolean;
      wasTruncated: boolean;
      httpStatus?: number;
      error: string;
    };

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

const toolDescription = `Fetch a URL and return readable markdown content.

Usage:
- Supports only http and https URLs.
- HTTP URLs are upgraded to HTTPS before fetching.
- Returns readable Markdown extracted from the page body.
- If \`query\` is provided, the tool uses the configured extraction client to answer that question from the page content.
- Use this for direct page reads; use Browser tools only when JavaScript rendering is required.`;

const parametersSchema = Type.Object({
  url: Type.String({ description: "HTTP or HTTPS URL to fetch." }),
  query: Type.Optional(
    Type.String({
      description:
        "Optional focused question to extract from the page. Requires an extraction client to be configured.",
    }),
  ),
});

function createTimedSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
}

function getFromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeFetchUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("WebFetch only supports absolute http/https URLs");
  }

  if (parsed.protocol === "http:") {
    parsed.protocol = "https:";
  }

  if (parsed.protocol !== "https:") {
    throw new Error("WebFetch only supports http/https URLs");
  }

  parsed.hash = "";
  return parsed.toString();
}

function isTrustedDomain(urlString: string, trustedDomains: string[]): boolean {
  try {
    const hostname = new URL(urlString).hostname.toLowerCase();
    return trustedDomains.some((domain) => {
      const normalized = domain.toLowerCase();
      return hostname === normalized || hostname.endsWith(`.${normalized}`);
    });
  } catch {
    return false;
  }
}

function truncateIfNeeded(content: string, maxChars: number, trusted: boolean) {
  if (trusted || content.length <= maxChars) {
    return { content, wasTruncated: false };
  }

  return {
    content: `${content.slice(0, maxChars)}\n\n[truncated]`,
    wasTruncated: true,
  };
}

function extractReadableMarkdown(source: string, url: string, contentType: string | null) {
  const looksHtml = Boolean(contentType?.includes("text/html")) || /<html[\s>]|<body[\s>]|<article[\s>]/i.test(source);

  if (!looksHtml) {
    return {
      title: url,
      markdown: normalizeWhitespace(source),
    };
  }

  const dom = new JSDOM(source, { url });
  const article = new Readability(dom.window.document).parse();
  const title = normalizeWhitespace(
    article?.title ||
      dom.window.document.title ||
      url,
  );

  const articleHtml = article?.content ?? dom.window.document.body?.innerHTML ?? "";
  const markdown = normalizeWhitespace(turndown.turndown(articleHtml));

  return {
    title: title || url,
    markdown,
  };
}

/** Creates a generic web fetch tool with readable markdown extraction and caching. */
export function createWebFetchTool(options: WebFetchToolOptions = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseChars = options.maxResponseChars ?? DEFAULT_MAX_RESPONSE_CHARS;
  const trustedDomains = options.trustedDomains ?? [];

  return tool()
    .name("WebFetch")
    .label("WebFetch")
    .description(toolDescription)
    .parameters(parametersSchema)
    .execute(async ({ url, query }, ctx) => {
      const requestedUrl = normalizeFetchUrl(url);
      const pageCacheKey = requestedUrl;
      const extractionCacheKey = query ? `${requestedUrl}::${query}` : null;

      if (query && !options.extractionClient) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: WebFetch query extraction requires an extractionClient.",
            },
          ],
          details: {
            status: "error",
            requestedUrl,
            title: requestedUrl,
            content: "",
            markdown: "",
            extracted: false,
            query,
            fromPageCache: false,
            fromExtractionCache: false,
            wasTruncated: false,
            error: "WebFetch query extraction requires an extractionClient.",
          } satisfies WebFetchDetails,
        };
      }

      let fromPageCache = false;
      const cachedPage = getFromCache(pageCache, pageCacheKey);
      let page: CachedPage;

      if (cachedPage) {
        fromPageCache = true;
        page = cachedPage;
      } else {
        try {
          const response = await fetch(requestedUrl, {
            headers: {
              "User-Agent": "Agentrail-WebFetch/1.0",
              Accept:
                "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,text/markdown;q=0.9,*/*;q=0.8",
            },
            signal: createTimedSignal(ctx.signal, timeoutMs),
          });

          const finalUrl = normalizeFetchUrl(response.url || requestedUrl);

          if (!response.ok) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: WebFetch failed with status ${response.status}`,
                },
              ],
              details: {
                status: "http_error",
                requestedUrl,
                finalUrl,
                title: finalUrl,
                content: "",
                markdown: "",
                extracted: false,
                query,
                fromPageCache: false,
                fromExtractionCache: false,
                wasTruncated: false,
                httpStatus: response.status,
                error: `WebFetch failed with status ${response.status}`,
              } satisfies WebFetchDetails,
            };
          }

          const source = await response.text();
          const extracted = extractReadableMarkdown(source, finalUrl, response.headers.get("content-type"));

          if (!extracted.markdown) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: Fetched page but extracted content was empty.",
                },
              ],
              details: {
                status: "empty_content",
                requestedUrl,
                finalUrl,
                title: extracted.title || finalUrl,
                content: "",
                markdown: "",
                extracted: false,
                query,
                fromPageCache: false,
                fromExtractionCache: false,
                wasTruncated: false,
                error: "Fetched page but extracted content was empty.",
              } satisfies WebFetchDetails,
            };
          }

          page = {
            finalUrl,
            title: extracted.title,
            markdown: extracted.markdown,
          };
          setCache(pageCache, pageCacheKey, page, DEFAULT_CACHE_TTL_MS);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const isTimeout =
            error instanceof Error &&
            (error.name === "TimeoutError" ||
              /timed out|timeout/i.test(error.message));

          return {
            content: [{ type: "text" as const, text: `Error: ${message}` }],
            details: {
              status: isTimeout ? "timeout" : "error",
              requestedUrl,
              title: requestedUrl,
              content: "",
              markdown: "",
              extracted: false,
              query,
              fromPageCache: false,
              fromExtractionCache: false,
              wasTruncated: false,
              error: message,
            } satisfies WebFetchDetails,
          };
        }
      }

      const trusted = isTrustedDomain(page.finalUrl, trustedDomains);

      if (!query) {
        const truncated = truncateIfNeeded(page.markdown, maxResponseChars, trusted);
        return {
          content: [{ type: "text" as const, text: truncated.content }],
          details: {
            status: "success",
            requestedUrl,
            finalUrl: page.finalUrl,
            title: page.title,
            content: truncated.content,
            markdown: truncated.content,
            extracted: false,
            fromPageCache,
            fromExtractionCache: false,
            wasTruncated: truncated.wasTruncated,
          } satisfies WebFetchDetails,
        };
      }

      let fromExtractionCache = false;
      const cachedExtraction = extractionCacheKey ? getFromCache(extractionCache, extractionCacheKey) : null;
      let extraction: CachedExtraction;

      if (cachedExtraction) {
        fromExtractionCache = true;
        extraction = cachedExtraction;
      } else {
        const result = await options.extractionClient!.extract({
          url: page.finalUrl,
          title: page.title,
          markdown: page.markdown,
          query,
          signal: createTimedSignal(ctx.signal, timeoutMs),
        });
        extraction = {
          content: result.content,
          details: result.details,
        };
        if (extractionCacheKey) {
          setCache(extractionCache, extractionCacheKey, extraction, DEFAULT_CACHE_TTL_MS);
        }
      }

      return {
        content: [{ type: "text" as const, text: extraction.content }],
        details: {
          status: "success",
          requestedUrl,
          finalUrl: page.finalUrl,
          title: page.title,
          content: extraction.content,
          markdown: page.markdown,
          extracted: true,
          query,
          fromPageCache,
          fromExtractionCache,
          wasTruncated: false,
          ...(extraction.details !== undefined ? { extractionDetails: extraction.details } : {}),
        } satisfies WebFetchDetails,
      };
    })
    .build();
}
