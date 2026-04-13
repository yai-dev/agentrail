# `Bash`

Execute a shell command and return its output.

**Package:** `@agentrail/capabilities`

## Parameters

| Name                | Type      | Required | Description                                                                                                              |
| ------------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `command`           | `string`  | Yes      | The shell command to execute.                                                                                            |
| `working_directory` | `string`  | No       | Absolute path to the working directory. Defaults to the agent process's current working directory.                       |
| `timeout`           | `integer` | No       | Milliseconds to wait before moving the process to background. Defaults to `30000`. Set to `0` to immediately background. |

## Result

The tool returns combined stdout and stderr as text. The `details` field is a discriminated union:

**Foreground** (completed within `timeout`):

```ts
{
  mode: "foreground";
  exit_code: number;
  stdout: string;
  stderr: string;
}
```

**Background** (still running after `timeout`):

```ts
{
  mode: "background";
  pid?: number;
  stdout: string; // partial output captured before timeout
  stderr: string;
}
```

Non-zero exit codes are not treated as tool errors — always check `exit_code` in the result.

## Permissions

`Bash` has a built-in `checkPermissions` hook. Before executing, it:

1. Normalizes the command string.
2. Checks whether the command is considered dangerous (e.g. `rm -rf /`).
3. Evaluates the active `ToolPermissionPolicy` (if one is configured) against the normalized command using `"command"` content mode.

To require approval before every shell call:

```yaml
# agentrail.yaml
permissions:
  mode: default
  ask:
    - "Bash"
```

To block specific commands while allowing others:

```yaml
permissions:
  mode: default
  deny:
    - "Bash(rm:*)"
  allow:
    - "Bash(git:*)"
    - "Bash(npm:*)"
```

See [Tool Permissions](../guides/tool-permissions.md) for the full DSL reference.

## Usage notes

- Do not use `Bash` for file reads or writes — use `Read`, `Write`, or `Edit` instead.
- Do not use `Bash` for file search — use `Grep` instead.
- Set `timeout: 0` for long-running processes (dev servers, watchers) that should run in the background.
- Output is truncated at 1 MB.
- **`/workspace/memo/**`is read-only for Bash.** Shell writes to memo paths (e.g.`echo ... > /workspace/memo/session/NOTES.md`) will fail with a permission error. Use the `Write`or`Edit` tools to persist memo changes — they write back to the backing store regardless of which storage backend is configured.

## Example

```ts
// In a tool call the agent would emit:
{
  command: "git log --oneline -5",
  working_directory: "/workspace/myproject"
}
```

## Sandbox variant

When the sandbox capability is active, a sandboxed `Bash` tool replaces the host-side variant. Key differences:

- Commands run inside an isolated Docker container.
- The working directory must be inside `/workspace` (defaults to `/workspace`).
- Session memo files are at `/workspace/memo/session/`; user profile at `/workspace/memo/user/USER.md`. These paths are **read-only** for Bash — writes must go through the `Write` or `Edit` tools.
- No `isDangerousCommand` check — the sandbox provides isolation instead.
- Background mode does not return a `pid` (the process runs inside the container).

## Related

- [Read](read.md)
- [Write](write.md)
- [Edit](edit.md)
- [Grep](grep.md)
- [Tool Permissions](../guides/tool-permissions.md)
