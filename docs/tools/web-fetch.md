# `WebFetch`

Fetch a URL and return readable Markdown content.

**Package:** `@agentrail/capabilities`

## Parameters

| Name    | Type     | Required | Description                                                                                                      |
| ------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `url`   | `string` | Yes      | HTTP or HTTPS URL to fetch. HTTP is automatically upgraded to HTTPS.                                             |
| `query` | `string` | No       | Optional focused question to extract from the page. Requires an `extractionClient` to be configured on the tool. |

## Result

Returns the page content as readable Markdown text. The `details` field is a tagged union keyed on `status`:

**Success:**

```ts
{
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
```

**Error statuses:** `"http_error"` | `"timeout"` | `"empty_content"` | `"error"` — same shape with an additional `error: string` field.

## Caching

The tool maintains an in-memory page cache (15-minute TTL) and, when `query` is provided, a separate extraction cache. Subsequent calls to the same URL within the TTL window return cached content.

## Usage notes

- Only absolute `http://` or `https://` URLs are supported.
- Content is truncated at 50,000 characters by default (configurable via `maxResponseChars`).
- When `query` is provided without a configured `extractionClient`, the tool returns an error.
- Prefer `WebFetch` over browser tools when JavaScript rendering is not required.
- Page content is extracted using Mozilla Readability and converted to Markdown via Turndown.

## Factory options

`createWebFetchTool(options)` accepts:

| Option             | Type                       | Description                                             |
| ------------------ | -------------------------- | ------------------------------------------------------- |
| `extractionClient` | `WebFetchExtractionClient` | Optional LLM-backed extraction client for `query` mode. |
| `maxResponseChars` | `number`                   | Truncation limit. Defaults to `50000`.                  |
| `timeoutMs`        | `number`                   | Request timeout in milliseconds. Defaults to `30000`.   |
| `trustedDomains`   | `string[]`                 | Domains exempt from truncation.                         |

## Example

```ts
// Fetch a page
{ url: "https://docs.example.com/api" }

// Fetch and extract a specific answer
{ url: "https://docs.example.com/api", query: "What are the rate limits?" }
```

## Related

- [WebSearch](web-search.md)
- [BrowserNavigate](browser-navigate.md)
