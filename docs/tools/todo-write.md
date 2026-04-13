# `TodoWrite`

Create and manage a structured task list for the current agent session.

**Package:** `@agentrail/capabilities`

## Parameters

| Name    | Type         | Required | Description                                                                                           |
| ------- | ------------ | -------- | ----------------------------------------------------------------------------------------------------- |
| `todos` | `TodoItem[]` | Yes      | Array of task objects to write or merge.                                                              |
| `merge` | `boolean`    | Yes      | If `true`, upsert incoming todos into the existing list by `id`. If `false`, replace the entire list. |

### `TodoItem` schema

| Field        | Type                                            | Required | Description                                                                             |
| ------------ | ----------------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| `id`         | `string`                                        | Yes      | Unique identifier for the task.                                                         |
| `content`    | `string`                                        | Yes      | Imperative description (e.g. `"Fix authentication bug"`).                               |
| `status`     | `"pending"` \| `"in_progress"` \| `"completed"` | Yes      | Current task status.                                                                    |
| `activeForm` | `string`                                        | No       | Present-continuous form shown while `in_progress` (e.g. `"Fixing authentication bug"`). |

## Result

Returns a plain-text summary of the current task list with status icons:

```
Current task list:
▶ [task-1] Fixing authentication bug (in_progress)
○ [task-2] Write unit tests (pending)
✓ [task-3] Update docs (completed)
```

The `details` field:

```ts
{ todos: TodoItem[] }
```

## Storage

`createTodoWriteTool(todoStorage)` accepts either a file path string or a `TodoStorage` adapter. When a file path is given, the tool persists the task list as a `TODO.md` file with embedded JSON data in an HTML comment.

## Usage rules

- Mark a task `in_progress` **before** beginning work on it.
- Mark a task `completed` **immediately** after finishing — do not batch completions.
- Only one task should be `in_progress` at any time.
- Never mark a task `completed` if it has unresolved errors or is only partially done.

## When to use

Use `TodoWrite` for:

- Complex multi-step tasks requiring 3 or more distinct steps.
- Tasks where the user provides multiple items at once.
- Tracking progress on long-running work so the user can see overall status.

Skip `TodoWrite` for single trivial tasks or purely conversational exchanges.

## Example

```ts
// Create a new task list
{
  merge: false,
  todos: [
    { id: "t1", content: "Scaffold project structure", status: "in_progress", activeForm: "Scaffolding project structure" },
    { id: "t2", content: "Add authentication", status: "pending" },
    { id: "t3", content: "Write tests", status: "pending" }
  ]
}

// Mark t1 complete and start t2
{
  merge: true,
  todos: [
    { id: "t1", content: "Scaffold project structure", status: "completed" },
    { id: "t2", content: "Add authentication", status: "in_progress", activeForm: "Adding authentication" }
  ]
}
```

## Related

- [AskUserQuestion](ask-user-question.md)
