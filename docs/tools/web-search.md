# `WebSearch`

Search the web and return normalized result candidates.

**Package:** `@agentrail/capabilities`

## Parameters

| Name          | Type      | Required | Description                                                                           |
| ------------- | --------- | -------- | ------------------------------------------------------------------------------------- |
| `query`       | `string`  | Yes      | Search query string.                                                                  |
| `max_results` | `integer` | No       | Maximum number of results to return. Defaults to `5`. Maximum is `10` (configurable). |

## Result

Returns a JSON array of search results as text. The `details` field:

```ts
{
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    publishedAt?: string;
  }>;
}
```

## Providers

`createWebSearchTool(provider, options)` requires a `WebSearchProvider`. Three built-in adapters are available:

| Factory                                  | Provider                                      |
| ---------------------------------------- | --------------------------------------------- |
| `createTavilySearchProvider({ apiKey })` | [Tavily](https://tavily.com)                  |
| `createBraveSearchProvider({ apiKey })`  | [Brave Search](https://brave.com/search/api/) |
| `createJinaSearchProvider({ apiKey? })`  | [Jina AI](https://jina.ai)                    |

All adapters accept an optional `timeoutMs` (defaults to `20000`).

## Factory options

`createWebSearchTool(provider, options)` accepts:

| Option              | Type     | Description                                                          |
| ------------------- | -------- | -------------------------------------------------------------------- |
| `maxResultsDefault` | `number` | Default result count when `max_results` is omitted. Defaults to `5`. |
| `maxResultsLimit`   | `number` | Upper bound enforced on `max_results`. Defaults to `10`.             |

## Wiring example

```ts
import { createWebSearchTool, createTavilySearchProvider } from "@agentrail/capabilities";

const webSearch = createWebSearchTool(
  createTavilySearchProvider({ apiKey: process.env.TAVILY_API_KEY! }),
);
```

Then pass `webSearch` into a profile's `agent.tools` array.

## Usage notes

- Use `WebFetch` to read the full content of a result URL.
- Results are normalized across providers — `title`, `url`, `snippet`, and optional `publishedAt` are always present.

## Related

- [WebFetch](web-fetch.md)
