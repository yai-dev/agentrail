# Tools

Agentrail provides a set of built-in tools through `@agentrail/capabilities`. Tools are registered on a profile and exposed to the agent at runtime.

## Tool categories

### Filesystem

| Tool              | Description                                |
| ----------------- | ------------------------------------------ |
| [Bash](bash.md)   | Execute shell commands                     |
| [Read](read.md)   | Read files from the local filesystem       |
| [Write](write.md) | Write files to the local filesystem        |
| [Edit](edit.md)   | Exact string replacement in existing files |
| [Grep](grep.md)   | Regex search powered by ripgrep            |
| [Glob](glob.md)   | Find files by glob pattern                 |

### Web

| Tool                       | Description                              |
| -------------------------- | ---------------------------------------- |
| [WebFetch](web-fetch.md)   | Fetch a URL and return readable Markdown |
| [WebSearch](web-search.md) | Search the web via a provider adapter    |

### Interaction

| Tool                                    | Description                                     |
| --------------------------------------- | ----------------------------------------------- |
| [AskUserQuestion](ask-user-question.md) | Pause execution and ask the user a question     |
| [TodoWrite](todo-write.md)              | Maintain a structured task list for the session |
| [Sleep](sleep.md)                       | Pause execution for a bounded duration          |

### Sandbox-only

These tools are available only when the agent runs inside a Docker sandbox container (see `@agentrail/capabilities` sandboxed capability set).

| Tool                                   | Description                                               |
| -------------------------------------- | --------------------------------------------------------- |
| [Python](python.md)                    | Execute Python code inside the sandbox                    |
| [BrowserNavigate](browser-navigate.md) | Navigate the in-sandbox Chromium browser to a URL         |
| [BrowserContent](browser-content.md)   | Read the current browser page's visible text              |
| [BrowserScroll](browser-scroll.md)     | Scroll the current browser page or an element             |
| [BrowserAction](browser-action.md)     | Click, fill, select, hover, press, or evaluate JavaScript |

### Orchestration

Orchestration tools are available when the multi-agent orchestration capability is enabled.

| Tool                          | Description                                        |
| ----------------------------- | -------------------------------------------------- |
| [spawn_agent](spawn-agent.md) | Spawn a session-scoped orchestration sub-agent     |
| [close_agent](close-agent.md) | Close a sub-agent and resolve dependent waits      |
| [send_input](send-input.md)   | Queue structured input for a sub-agent             |
| [wait_agent](wait-agent.md)   | Wait for one or more agents to satisfy a condition |

## Additional capability tools

The following tools are provided by optional capability packages and documented inline:

- **KbList / KbRead / KbSearch** — knowledge base tools from the `knowledge` capability
- **Skill** — skill delegation tool from the `skills` capability

## Permissions

Several tools (`Bash`, `Read`, `Write`, `Edit`, and their sandbox counterparts) support a `checkPermissions` hook that evaluates the active `ToolPermissionPolicy` before execution. See the [Tool Permissions Guide](../guides/tool-permissions.md) for details.

## Related

- [Add Tools](../guides/add-tools.md)
- [Tool Permissions](../guides/tool-permissions.md)
- [Use Capability Packages](../guides/use-capability-packages.md)
