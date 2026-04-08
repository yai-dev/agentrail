# Consume Stream (SSE)

> **Recommended path**: Use `createAgentApp` from `@agentrail/app` to mount the `/stream` endpoint. `createStreamRoute` is available as a lower-level escape hatch when you need direct control over route mounting.

`createAgentApp` (and the underlying `createStreamRoute`) returns a streaming HTTP response in newline-delimited JSON format. This guide shows how to consume that stream from a browser client or a Node.js service.

## Prerequisites

Read this guide after:

- [Quickstart](quickstart.md)
- [Concepts: Events](../concepts/events.md)

## How the Stream Works

When you `POST` to a stream endpoint:

1. The server immediately begins executing the agent and starts streaming.
2. The response body is a series of newline-separated JSON objects, one event per line.
3. The response header `X-Session-Id` contains the session ID for subsequent requests.
4. The stream closes after the `agent_end` event and any final host events (`context_usage`).

Each line in the body is a serialized `AgentrailEvent` from `@agentrail/app`. The event's `type` field identifies what happened.

## Request Format

```ts
POST /api/stream
Content-Type: application/json

{
  "message": "Hello, how can you help me?",
  "agentId": "default",         // optional, uses server default if omitted
  "sessionId": "session-uuid",  // optional, creates new session if omitted
  "tenantId": "tenant-1",       // optional
  "userId": "user-1"            // optional
}
```

## Minimal Browser Example

```ts
async function chat(message: string, sessionId?: string) {
  const response = await fetch("/api/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  // Extract sessionId from response header for future requests
  const nextSessionId = response.headers.get("X-Session-Id") ?? sessionId;

  // Read the stream line by line
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      handleEvent(event);
    }
  }

  return nextSessionId;
}
```

## Key Event Types

Handle these events to build a complete streaming UI:

| Event type                 | When                      | Key fields                                     |
| -------------------------- | ------------------------- | ---------------------------------------------- |
| `message_start`            | LLM starts generating     | —                                              |
| `message_update`           | Text delta from LLM       | `delta: string`                                |
| `message_end`              | LLM finished generating   | —                                              |
| `tool_execution_start`     | Agent begins a tool call  | `toolName`, `toolCallId`, `label`              |
| `tool_execution_end`       | Tool call completes       | `toolCallId`, `result`                         |
| `context_compaction_start` | History compaction begins | —                                              |
| `context_compaction_end`   | Compaction finished       | —                                              |
| `context_usage`            | Token budget after turn   | `inputTokens`, `outputTokens`, `budgetUsedPct` |
| `agent_end`                | Agent loop finished       | `messages`, `usage`                            |
| `error`                    | Unrecoverable error       | `error.message`                                |

## Example Event Handler

```ts
import type { AgentrailEvent } from "@agentrail/app";

function handleEvent(event: AgentrailEvent) {
  switch (event.type) {
    case "message_update":
      // Append text delta to the UI
      appendText(event.delta ?? "");
      break;

    case "tool_execution_start":
      // Show a tool-in-progress indicator
      showToolIndicator(event.label ?? event.toolName, "running");
      break;

    case "tool_execution_end":
      // Update indicator to completed
      showToolIndicator(event.toolCallId, "done");
      break;

    case "context_compaction_start":
      showCompactionBadge(true);
      break;

    case "context_compaction_end":
      showCompactionBadge(false);
      break;

    case "context_usage":
      // Update token budget bar
      updateBudgetBar(event.budgetUsedPct ?? 0);
      break;

    case "agent_end":
      // Final usage stats
      console.log("Total tokens:", event.usage?.totalTokens);
      break;

    case "error":
      showError(event.error.message);
      break;
  }
}
```

## Session Continuity

The stream endpoint returns the session ID in the `X-Session-Id` response header. Store this and include it in subsequent requests to continue the conversation:

```ts
let currentSessionId: string | undefined;

async function sendMessage(text: string) {
  const nextSessionId = await chat(text, currentSessionId);
  currentSessionId = nextSessionId;
}
```

On first request, omit `sessionId` — the server creates a new session. On all subsequent requests, pass the stored `sessionId` to resume the same conversation.

## Node.js / Server-Side Consumption

When consuming the stream from another Node.js service (for example, a BFF layer):

```ts
import { Readable } from "node:stream";

async function streamFromServer(message: string, sessionId?: string) {
  const response = await fetch("http://agent-server/api/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId }),
  });

  const nextSessionId = response.headers.get("X-Session-Id");
  const events: AgentrailEvent[] = [];

  const readable = Readable.fromWeb(response.body as ReadableStream);
  let buffer = "";

  for await (const chunk of readable) {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) events.push(JSON.parse(line));
    }
  }

  return { events, nextSessionId };
}
```

## Orchestration Events

If the server uses multi-agent orchestration, additional events appear in the stream:

| Event type                   | Meaning                        |
| ---------------------------- | ------------------------------ |
| `orchestration_run_start`    | A multi-agent run began        |
| `subagent_spawned`           | A sub-agent was created        |
| `subagent_status`            | A sub-agent's state changed    |
| `subagent_job_started`       | A sub-agent started processing |
| `subagent_job_completed`     | A sub-agent finished a job     |
| `subagent_closed`            | A sub-agent was closed         |
| `orchestration_run_complete` | The multi-agent run finished   |

These events are especially useful for building orchestration dashboards or progress views.

## TypeScript Types

Import the full event union from `@agentrail/app`:

```ts
import type { AgentrailEvent, AgentrailHostEvent } from "@agentrail/app";
```

`AgentrailEvent` combines runtime events, skill events, and host events — it is the right type for a general-purpose event consumer.

## Related Concepts

- [Events](../concepts/events.md)
- [Host](../concepts/host.md)
- [Orchestration](../concepts/orchestration.md)

## Related Reference

- [Events Reference](../reference/events.md)
- [Host Primitives Reference](../reference/host-primitives.md)
