# `Read`

Read a file from the local filesystem.

**Package:** `@agentrail/capabilities`

## Parameters

| Name        | Type      | Required | Description                                                                                                            |
| ----------- | --------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `file_path` | `string`  | Yes      | Absolute path of the file to read.                                                                                     |
| `offset`    | `integer` | No       | Line number to start reading from (1-indexed). Negative values count from the end (`-1` = last line). Defaults to `1`. |
| `limit`     | `integer` | No       | Maximum number of lines to read. Defaults to `100`.                                                                    |

## Result

Lines are returned with a `LINE_NUMBER|LINE_CONTENT` prefix. Lines longer than 1000 characters are truncated with `[truncated]`.

The `details` field:

```ts
{
  totalLines: number;
  startLine: number;
  endLine: number;
  lines: string[];
}
```

Reading a non-existent file returns an error message in `content` rather than throwing. Reading an empty file returns a system reminder in `content`.

## Permissions

`Read` has a `checkPermissions` hook that:

1. Rejects paths that fail a safety check (e.g. null bytes, traversal attempts).
2. If a `rootDir` is configured, rejects paths outside that directory.
3. Evaluates the active `ToolPermissionPolicy` against `file_path`.

## Usage notes

- `file_path` must be an absolute path.
- Read multiple files in parallel when possible — multiple `Read` calls can be issued in one turn.
- To list a directory, use `Bash` with `ls`, or use `Glob`.

## Example

```ts
// Read the first 50 lines of a file
{ file_path: "/workspace/src/index.ts", limit: 50 }

// Read the last 20 lines
{ file_path: "/workspace/logs/app.log", offset: -20 }
```

## Sandbox variant

When the sandbox capability is active, a sandboxed `Read` tool replaces the host-side variant. It reads from the container's filesystem; `file_path` must be an absolute path inside the sandbox (typically under `/workspace`).

## Related

- [Write](write.md)
- [Edit](edit.md)
- [Glob](glob.md)
- [Grep](grep.md)
