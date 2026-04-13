# `AskUserQuestion`

Pause agent execution and ask the user a question, optionally presenting predefined choices.

**Package:** `@agentrail/capabilities`

## Parameters

| Name       | Type       | Required | Description                                                                                                      |
| ---------- | ---------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `question` | `string`   | Yes      | The question to present to the user. Be specific and concise.                                                    |
| `hint`     | `string`   | No       | Optional hint shown below the question (e.g. expected format, constraints). Omit when `options` are provided.    |
| `options`  | `string[]` | No       | Predefined choices rendered as clickable buttons. Do not include an "Other" option — use `custom: true` instead. |
| `multiple` | `boolean`  | No       | Allow the user to select more than one option. Defaults to `false`.                                              |
| `custom`   | `boolean`  | No       | Add a "Type your own answer" entry automatically. Defaults to `true`.                                            |

## Result

```ts
{
  question: string;
  answer: string;
}
```

When `multiple` is `true`, selected options are returned as a comma-separated string.

## How it works

When called, the tool:

1. Emits a `waiting_for_user_input` event on the runtime stream with the question and options.
2. Suspends execution and waits for the host to provide an answer via the wait-handle registry.
3. Resumes and returns the user's answer to the model.

The host layer (e.g. the playground server) receives the `waiting_for_user_input` event and must POST the user's answer back to resume the run.

## UI Integration

`AskUserQuestion` is not just a tool parameter contract. It is a suspend-and-resume flow between:

1. the runtime event stream
2. your UI
3. your host's wait-handle registry

### 1. Runtime event sent to the UI

The runtime emits a `waiting_for_user_input` event with the question payload:

```ts
{
  type: "waiting_for_user_input";
  toolCallId: string;
  question: string;
  hint?: string;
  options?: string[];
  multiple?: boolean;
  custom?: boolean;
}
```

Your UI should listen for this event and render an input surface for the user.

### 2. Recommended UI behavior

- No `options`: show a text input and a submit button.
- `options` + `multiple: false`: show single-choice buttons.
- `options` + `multiple: true`: allow multi-select, then submit the combined answer.
- `custom: true`: allow a free-form answer in addition to predefined options.

The reference implementation is:

- [WaitingQuestionPrompt.tsx](https://github.com/yai-dev/agentrail/blob/main/examples/playground-ui/src/components/WaitingQuestionPrompt.tsx#L1)
- [App.tsx](https://github.com/yai-dev/agentrail/blob/main/examples/playground-ui/src/App.tsx#L551)

### 3. Submit the user's answer back to the host

Once the user answers, POST it back to the host so the suspended tool call can resume.

Playground uses:

```http
POST /api/sessions/:sessionId/respond
Content-Type: application/json
```

```json
{
  "kind": "question",
  "answer": "Vitest"
}
```

Reference implementation:

- [api.ts](https://github.com/yai-dev/agentrail/blob/main/examples/playground-ui/src/api.ts#L236)
- [sessions.ts](https://github.com/yai-dev/agentrail/blob/main/examples/playground-server/src/routes/sessions.ts#L196)

### 4. How execution resumes

After the host receives the answer:

1. it resolves the pending wait handle for that session
2. the suspended `AskUserQuestion` tool call resumes
3. the tool returns `{ question, answer }`
4. the agent continues the same turn with the user's response now available as tool output

In the playground server, this is handled by the wait-handle registry:

- [wait-handle-registry.ts](https://github.com/yai-dev/agentrail/blob/main/examples/playground-server/src/wait-handle-registry.ts#L1)

### Minimal client example

```ts
if (event.type === "waiting_for_user_input") {
  showQuestionPrompt(event);
}

async function submitAnswer(sessionId: string, answer: string) {
  await fetch(`/api/sessions/${sessionId}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "question", answer }),
  });
}
```

## Usage notes

- When recommending a specific option, put it first and append `" (Recommended)"` to its label.
- Omit `options` for open-ended questions that require free-form text.
- When `custom: true` (default), a "Type your own answer" entry is added automatically — do not include an "Other" catch-all in `options`.
- The agent is blocked until the user responds. Use this tool sparingly; batch questions when possible.

## Example

```ts
// Open-ended question
{
  question: "What is the target deployment environment?",
  hint: "e.g. AWS, GCP, Azure, or on-premises"
}

// Multiple-choice question with a recommendation
{
  question: "Which testing framework should I use?",
  options: ["Vitest (Recommended)", "Jest", "Mocha"],
  custom: false
}
```

## Related

- [TodoWrite](todo-write.md)
- [Consume Stream (SSE)](../guides/consume-stream.md)
