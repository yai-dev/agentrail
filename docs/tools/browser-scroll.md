# `BrowserScroll`

Scroll the current browser page or a specific element.

**Package:** `@agentrail/capabilities` (sandbox-only)

> This tool is available only when the sandboxed capability set is active.

## Parameters

| Name        | Type                                        | Required | Description                                                                |
| ----------- | ------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| `selector`  | `string`                                    | No       | CSS selector of the element to scroll. If omitted, scrolls the whole page. |
| `direction` | `"down"` \| `"up"` \| `"left"` \| `"right"` | No       | Scroll direction. Defaults to `"down"`.                                    |
| `amount`    | `integer`                                   | No       | Pixels to scroll. Defaults to `500`.                                       |
| `deltaX`    | `integer`                                   | No       | Horizontal scroll delta in pixels. Alternative to `direction`+`amount`.    |
| `deltaY`    | `integer`                                   | No       | Vertical scroll delta in pixels. Alternative to `direction`+`amount`.      |

## Result

Returns the page scroll position after the scroll:

```
Scrolled successfully. Page scroll position: x=0, y=1200
```

The `details` field:

```ts
{
  scrollX: number;
  scrollY: number;
}
```

## Usage notes

- Use `direction`+`amount` for simple directional scrolling.
- Use `deltaX`/`deltaY` for precise pixel-level control.
- Always call `BrowserContent` after scrolling to read the newly visible content.

## Example

```ts
// Scroll down 800 pixels
{ direction: "down", amount: 800 }

// Scroll a specific container element
{ selector: ".results-list", direction: "down", amount: 400 }

// Precise horizontal scroll
{ deltaX: 300, deltaY: 0 }
```

## Related

- [BrowserNavigate](browser-navigate.md)
- [BrowserContent](browser-content.md)
- [BrowserAction](browser-action.md)
