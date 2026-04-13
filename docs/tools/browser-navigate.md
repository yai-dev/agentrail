# `BrowserNavigate`

Navigate the in-sandbox Chromium browser to a URL and return the page's text content.

**Package:** `@agentrail/capabilities` (sandbox-only)

> This tool is available only when the sandboxed capability set is active. It controls a persistent Chromium instance running inside the sandbox container.

## Parameters

| Name  | Type     | Required | Description                                          |
| ----- | -------- | -------- | ---------------------------------------------------- |
| `url` | `string` | Yes      | The URL to navigate to (e.g. `https://example.com`). |

## Result

Returns the page title and visible text content as a single string:

```
Navigated to: https://example.com
Title: Example Domain

...page text content...
```

The `details` field:

```ts
{
  url: string;
  title: string;
}
```

## Usage notes

- The browser session persists across calls within the same agent session. Navigation history is maintained.
- After navigating, use `BrowserContent`, `BrowserScroll`, or `BrowserAction` for further interaction.
- If dynamic content loads after navigation (JavaScript rendering), call `BrowserContent` again after a short delay.
- Use `WebFetch` instead when JavaScript rendering is not required — it is faster and lighter.

## Example

```ts
{
  url: "https://github.com/trending";
}
```

## Related

- [BrowserContent](browser-content.md)
- [BrowserScroll](browser-scroll.md)
- [BrowserAction](browser-action.md)
- [WebFetch](web-fetch.md)
