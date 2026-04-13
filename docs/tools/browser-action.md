# `BrowserAction`

Perform an interaction on the current browser page.

**Package:** `@agentrail/capabilities` (sandbox-only)

> This tool is available only when the sandboxed capability set is active.

## Parameters

| Name       | Type                                                                          | Required | Description                                                                                                              |
| ---------- | ----------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `type`     | `"click"` \| `"fill"` \| `"select"` \| `"hover"` \| `"press"` \| `"evaluate"` | Yes      | The type of action to perform.                                                                                           |
| `selector` | `string`                                                                      | No       | CSS selector of the target element. Required for `click`, `fill`, `select`, `hover`, and `press`.                        |
| `value`    | `string`                                                                      | No       | Value to fill/select, or key to press (e.g. `"Enter"`, `"Escape"`, `"Tab"`). Required for `fill`, `select`, and `press`. |
| `script`   | `string`                                                                      | No       | JavaScript to evaluate. Required for the `evaluate` action.                                                              |

### Action types

| Type       | Description                                                  |
| ---------- | ------------------------------------------------------------ |
| `click`    | Click the element identified by `selector`.                  |
| `fill`     | Clear and set the value of an input or textarea.             |
| `select`   | Select an option in a `<select>` element by value or label.  |
| `hover`    | Hover over an element to trigger tooltips or dropdown menus. |
| `press`    | Press a keyboard key, optionally on a focused element.       |
| `evaluate` | Run arbitrary JavaScript and return the result as a string.  |

## Result

Returns a text description of the outcome. The `details` field:

```ts
{ type: string; result?: unknown }
```

## Usage notes

- Always read the page with `BrowserContent` before interacting so you know which selectors exist.
- After a `click` that triggers navigation, call `BrowserContent` again to get the new page state.
- Use `evaluate` for actions that cannot be expressed with the other types (e.g. programmatic form submission, reading computed styles).

## Example

```ts
// Click a submit button
{ type: "click", selector: "#submit-btn" }

// Fill a search input and press Enter
{ type: "fill", selector: "input[name=q]", value: "agentrail docs" }
{ type: "press", selector: "input[name=q]", value: "Enter" }

// Select a dropdown option
{ type: "select", selector: "#country-select", value: "US" }

// Evaluate JavaScript
{ type: "evaluate", script: "document.title" }
```

## Related

- [BrowserNavigate](browser-navigate.md)
- [BrowserContent](browser-content.md)
- [BrowserScroll](browser-scroll.md)
