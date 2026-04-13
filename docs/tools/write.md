# `Write`

Write content to a file on the local filesystem.

**Package:** `@agentrail/capabilities`

## Parameters

| Name        | Type     | Required | Description                                                |
| ----------- | -------- | -------- | ---------------------------------------------------------- |
| `file_path` | `string` | Yes      | Absolute path of the file to write.                        |
| `contents`  | `string` | Yes      | Content to write. Overwrites the entire file if it exists. |

## Result

On success:

```ts
{
  file_path: string;
}
```

On error, `details` contains `{ error: string }`.

Parent directories are created automatically (`mkdir -p` semantics).

## Permissions

`Write` has a `checkPermissions` hook that:

1. Rejects paths that fail safety checks.
2. If a `rootDir` is configured, rejects paths outside that directory.
3. Evaluates the active `ToolPermissionPolicy` against `file_path`.

To require user approval before any file write:

```yaml
permissions:
  mode: default
  ask:
    - "Write"
```

To restrict writes to a subdirectory:

```yaml
permissions:
  mode: strict
  allow:
    - "Write(/workspace/**)"
```

## Usage notes

- Prefer `Edit` for modifying existing files — it sends only the diff.
- Use `Write` only for creating new files or for complete rewrites.
- Do not create documentation or README files unless explicitly requested.

## Example

```ts
{ file_path: "/workspace/src/config.ts", contents: "export const PORT = 3000;\n" }
```

## Sandbox variant

The sandboxed `Write` tool writes into the container filesystem. Paths must be inside `/workspace`.

## Related

- [Read](read.md)
- [Edit](edit.md)
- [Tool Permissions](../guides/tool-permissions.md)
