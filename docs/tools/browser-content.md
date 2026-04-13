# `BrowserContent`

Read the current browser page's visible text content.

**Package:** `@agentrail/capabilities` (sandbox-only)

> This tool is available only when the sandboxed capability set is active.

## Parameters

| Name           | Type      | Required | Description                                                                                  |
| -------------- | --------- | -------- | -------------------------------------------------------------------------------------------- |
| `include_html` | `boolean` | No       | If `true`, also return the raw HTML (useful for finding CSS selectors). Defaults to `false`. |

## Result

Returns the page's visible text as a string. When `include_html: true`, the raw HTML is appended after a `--- HTML ---` separator.

The `details` field:

```ts
{
  textContent: string;
  hasHtml: boolean;
}
```

## Usage notes

- Call `BrowserContent` after any action that may change the page (navigation, click, fill, scroll) to get the updated state.
- Use `include_html: true` only when you need to inspect the page structure or find CSS selectors for `BrowserAction`.
- Returns `"(empty page)"` when no content is found.

## Example

```ts
// Read current page text
{
}

// Read page text and HTML for selector discovery
{
  include_html: true;
}
```

## Related

- [BrowserNavigate](browser-navigate.md)
- [BrowserScroll](browser-scroll.md)
- [BrowserAction](browser-action.md)
