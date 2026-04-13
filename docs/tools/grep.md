# `Grep`

Search file contents using ripgrep.

**Package:** `@agentrail/capabilities`

## Parameters

| Name               | Type                                               | Required | Description                                                                                              |
| ------------------ | -------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `pattern`          | `string`                                           | Yes      | Regular expression pattern to search for.                                                                |
| `path`             | `string`                                           | No       | File or directory to search in. Defaults to the current working directory.                               |
| `glob`             | `string`                                           | No       | Glob pattern to filter files (e.g. `"*.ts"`, `"**/*.{ts,tsx}"`).                                         |
| `type`             | `string`                                           | No       | File type to search (e.g. `"js"`, `"py"`, `"rust"`). More efficient than `glob` for standard file types. |
| `output_mode`      | `"content"` \| `"files_with_matches"` \| `"count"` | No       | Output format. Defaults to `"files_with_matches"`.                                                       |
| `multiline`        | `boolean`                                          | No       | Enable multiline mode where patterns can span lines. Default: `false`.                                   |
| `case_insensitive` | `boolean`                                          | No       | Case-insensitive search. Default: `false`.                                                               |

### Output modes

| Value                  | Description                                              |
| ---------------------- | -------------------------------------------------------- |
| `"files_with_matches"` | Return only the paths of matching files (default).       |
| `"content"`            | Return matching lines with file and line number context. |
| `"count"`              | Return the number of matches per file.                   |

## Result

```ts
{ matches: string[] }
```

Returns `"(no matches)"` when nothing is found.

## Usage notes

- Always use `Grep` for code search. Never call `grep` or `rg` via `Bash`.
- Literal braces require escaping in regex: use `interface\{\}` to find `interface{}`.
- For cross-line patterns use `multiline: true` with a pattern like `struct \{[\s\S]*?field`.
- Combine `type` and `pattern` for efficient language-specific searches.

## Example

```ts
// Find all TypeScript files exporting a function named "createTool"
{ pattern: "export function createTool", type: "ts", output_mode: "files_with_matches" }

// Show matching lines with context
{ pattern: "TODO|FIXME", path: "/workspace/src", output_mode: "content" }

// Case-insensitive search across markdown files
{ pattern: "permission", glob: "**/*.md", case_insensitive: true, output_mode: "content" }
```

## Sandbox variant

The sandboxed `Grep` tool runs `rg` inside the container. Usage is identical; `path` is relative to `/workspace` by default.

## Related

- [Glob](glob.md)
- [Bash](bash.md)
