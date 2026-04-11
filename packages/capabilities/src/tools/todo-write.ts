/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { RuntimeTool, TodoStorage } from "@agentrail/core";
import { tool } from "@agentrail/core";
import { Type } from "@sinclair/typebox";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

type TodoStatus = "pending" | "in_progress" | "completed";

interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
  activeForm?: string;
}

// --------------------------------------------------------------------------
// File format helpers
// --------------------------------------------------------------------------

const DATA_PATTERN = /<!--\s*data:\s*(\[[\s\S]*?\])\s*-->/m;

/** Parse the structured todo array from the hidden data comment. */
function parseData(raw: string): TodoItem[] {
  const match = raw.match(DATA_PATTERN);
  if (!match) return [];
  try {
    return JSON.parse(match[1]!) as TodoItem[];
  } catch {
    return [];
  }
}

/** Render a single todo item as a markdown list entry. */
function renderItem(todo: TodoItem): string {
  const label =
    todo.status === "in_progress"
      ? `**[in_progress]** ${todo.activeForm ?? todo.content}`
      : todo.status === "completed"
        ? `**[completed]** ~~${todo.content}~~`
        : `**[pending]** ${todo.content}`;
  return `- ${label} \`(id: ${todo.id})\``;
}

/** Build the summary annotation text. */
function buildSummary(todos: TodoItem[]): string {
  const counts: Record<TodoStatus, number> = { pending: 0, in_progress: 0, completed: 0 };
  for (const t of todos) counts[t.status]++;
  const total = todos.length;
  const parts = (["in_progress", "pending", "completed"] as TodoStatus[])
    .filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${s}`);
  return `${total} task${total !== 1 ? "s" : ""}: ${parts.join(", ")}`;
}

/** Serialise the todo list to the TODO.md file content. */
function serialise(todos: TodoItem[]): string {
  const summary = buildSummary(todos);
  const data = JSON.stringify(todos);
  const list = todos.length > 0 ? todos.map(renderItem).join("\n") : "_No tasks yet._";
  return [
    `<!-- summary: ${summary} -->`,
    `<!-- data: ${data} -->`,
    "",
    "# Task List",
    "",
    list,
    "",
  ].join("\n");
}

/** Merge incoming todos into the existing list (upsert by id). */
function mergeTodos(existing: TodoItem[], incoming: TodoItem[]): TodoItem[] {
  const map = new Map(existing.map((t) => [t.id, t]));
  for (const t of incoming) {
    map.set(t.id, { ...map.get(t.id), ...t });
  }
  return Array.from(map.values());
}

/** Format todos as a plain-text summary returned to the LLM. */
function formatResult(todos: TodoItem[]): string {
  if (todos.length === 0) return "Task list is empty.";
  const lines = todos.map((t) => {
    const icon = t.status === "completed" ? "✓" : t.status === "in_progress" ? "▶" : "○";
    const label = t.status === "in_progress" && t.activeForm ? t.activeForm : t.content;
    return `${icon} [${t.id}] ${label} (${t.status})`;
  });
  return `Current task list:\n${lines.join("\n")}`;
}

// --------------------------------------------------------------------------
// Tool description
// --------------------------------------------------------------------------

const toolDescription = `\
Use this tool to create and manage a structured task list for the current session. \
It helps track progress, organize complex tasks, and show the user overall progress.

**When to use:**
- Complex multi-step tasks requiring 3 or more distinct steps
- User provides multiple tasks at once
- Before starting a task: mark it as in_progress
- After completing a task: mark it as completed immediately

**When NOT to use:**
- Single, trivial tasks completable in one step
- Pure conversational or informational requests

**Parameters:**
- todos: array of task objects, each with id, content (imperative form, e.g. "Fix bug"), \
status (pending | in_progress | completed), and optional activeForm (present-continuous form, \
e.g. "Fixing bug" — shown while in_progress)
- merge: if true, upsert into existing list by id; if false, replace the entire list

**Rules:**
- Mark a task in_progress BEFORE beginning work
- Mark a task completed IMMEDIATELY after finishing — do not batch completions
- Only ONE task should be in_progress at any time
- Never mark a task completed if it has unresolved errors or is only partially done`;

// --------------------------------------------------------------------------
// Parameters schema
// --------------------------------------------------------------------------

const parametersSchema = Type.Object({
  todos: Type.Array(
    Type.Object({
      id: Type.String({ description: "Unique identifier for the task." }),
      content: Type.String({
        description: 'Imperative description of the task (e.g. "Fix authentication bug").',
      }),
      status: Type.Union(
        [Type.Literal("pending"), Type.Literal("in_progress"), Type.Literal("completed")],
        { description: "Current task status." },
      ),
      activeForm: Type.Optional(
        Type.String({
          description:
            'Present-continuous form shown while in_progress (e.g. "Fixing authentication bug").',
        }),
      ),
    }),
    { description: "Array of task items to write or merge." },
  ),
  merge: Type.Boolean({
    description:
      "If true, upsert incoming todos into the existing list by id. If false, replace the entire list.",
  }),
});

// --------------------------------------------------------------------------
// Factory
// --------------------------------------------------------------------------

function createFileTodoStorage(todoFilePath: string): TodoStorage {
  return {
    async read() {
      try {
        return await readFile(todoFilePath, "utf-8");
      } catch {
        return null;
      }
    },
    async write(content: string) {
      await mkdir(dirname(todoFilePath), { recursive: true });
      await writeFile(todoFilePath, content, "utf-8");
    },
  };
}

/**
 * Creates a TodoWrite tool backed by either a TODO.md file path or a storage adapter.
 * Designed to be registered on the main agent only (not skill sub-agents).
 */
export function createTodoWriteTool(todoStorage: string | TodoStorage): RuntimeTool {
  const storage =
    typeof todoStorage === "string" ? createFileTodoStorage(todoStorage) : todoStorage;

  return tool()
    .name("TodoWrite")
    .label("TodoWrite")
    .description(toolDescription)
    .parameters(parametersSchema)
    .execute(async ({ todos, merge: doMerge }) => {
      try {
        let finalTodos: TodoItem[];

        if (doMerge) {
          let existing: TodoItem[] = [];
          const raw = await storage.read();
          if (raw) {
            existing = parseData(raw);
          }
          finalTodos = mergeTodos(existing, todos as TodoItem[]);
        } else {
          finalTodos = todos as TodoItem[];
        }

        await storage.write(serialise(finalTodos));

        return {
          content: [{ type: "text" as const, text: formatResult(finalTodos) }],
          details: { todos: finalTodos },
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `TodoWrite error: ${message}` }],
          details: { error: message },
        };
      }
    })
    .build();
}
