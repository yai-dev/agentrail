# `Edit`

Perform an exact string replacement in an existing file.

**Package:** `@agentrail/capabilities`

## Parameters

| Name          | Type      | Required | Description                                                                       |
| ------------- | --------- | -------- | --------------------------------------------------------------------------------- |
| `file_path`   | `string`  | Yes      | Absolute path of the file to modify.                                              |
| `old_string`  | `string`  | Yes      | Exact text to replace, including all whitespace and indentation.                  |
| `new_string`  | `string`  | Yes      | Text to replace it with.                                                          |
| `replace_all` | `boolean` | No       | If `true`, replace all occurrences. Defaults to `false` (replace only the first). |

## Result

On success:

```ts
{
  replacedCount: number;
}
```

On error, `details` contains `{ error: string, occurrences?: number }`.

The tool fails if `old_string` is not found, or if it appears more than once and `replace_all` is `false`.

## Permissions

`Edit` has a `checkPermissions` hook with the same logic as `Write`: path safety check, optional `rootDir` anchoring, and policy evaluation.

## Usage notes

- Always use `Read` first to get the exact content, including whitespace and indentation.
- Never include line-number prefixes (`123|`) from `Read` output in `old_string`.
- Provide enough surrounding context in `old_string` to make it unique.
- Use `replace_all: true` for global renames (e.g. renaming a variable across a file).
- Prefer `Edit` over `Write` for targeted changes to existing files — it is more efficient.

## Example

```ts
// Change a function name
{
  file_path: "/workspace/src/utils.ts",
  old_string: "export function getUser(",
  new_string: "export function fetchUser("
}

// Replace all occurrences of a constant
{
  file_path: "/workspace/src/config.ts",
  old_string: "OLD_ENDPOINT",
  new_string: "NEW_ENDPOINT",
  replace_all: true
}
```

## Sandbox variant

The sandboxed `Edit` tool applies the same replacement logic inside the container filesystem. Paths must be inside `/workspace`.

## Related

- [Read](read.md)
- [Write](write.md)
- [Tool Permissions](../guides/tool-permissions.md)
