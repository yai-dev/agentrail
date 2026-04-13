# `Glob`

Find files by glob pattern.

**Package:** `@agentrail/capabilities`

## Parameters

| Name      | Type     | Required | Description                                                                                                    |
| --------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `pattern` | `string` | Yes      | Glob pattern to match (e.g. `"**/*.ts"`, `"src/**/*.md"`).                                                     |
| `path`    | `string` | No       | Subdirectory to search within. Must stay inside the configured root directory. Defaults to the workspace root. |

## Result

```ts
{
  searchRoot: string;
  matches: string[]; // paths relative to searchRoot, sorted alphabetically
}
```

Returns `"(no matches)"` when nothing is found.

## Usage notes

- Prefer `Glob` over `Bash ls` or manual directory traversal for file discovery.
- Results are relative to `searchRoot`, not absolute paths.
- Symlinks are not followed.
- Dotfiles are included by default.
- The tool enforces that `path` stays within the configured root directory.

## Example

```ts
// Find all TypeScript source files
{ pattern: "**/*.ts" }

// Find all test files in a specific directory
{ pattern: "**/*.test.ts", path: "packages/core" }

// Find all markdown files at the top level of docs/
{ pattern: "*.md", path: "docs" }
```

## Sandbox variant

The sandboxed `Glob` tool searches within the container filesystem. The root defaults to `/workspace`. The `path` parameter must remain inside `/workspace`.

## Related

- [Grep](grep.md)
- [Read](read.md)
