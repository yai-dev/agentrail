# Playground UI

The playground UI is the browser-side example that consumes Agentrail host routes and event streams. It demonstrates the full client-side integration pattern for a streaming agent application.

## Why Read This Example

Read this page to understand:

- how to call the `chat` and `stream` host entry points from a browser
- how to parse SSE events and update UI state in real time
- how to maintain session continuity across requests
- how to display orchestration and tool progress

## What This Example Demonstrates

- request/response chat interactions via `/api/chat`
- streamed event consumption via `/api/stream`
- session and turn history browsing
- orchestration and workflow visibility in a user-facing interface

---

## Stream Consumption Pattern

The stream endpoint returns an SSE-style text stream. Each line prefixed with `data: ` contains a JSON event payload.

### Minimal browser fetch

```ts
import type { AgentrailEvent } from "@agentrail/app";

interface ChatState {
  sessionId: string | null;
  text: string;
  isStreaming: boolean;
  tools: { name: string; status: "running" | "done" }[];
  budgetUsedPct: number | null;
}

async function sendMessage(
  message: string,
  state: ChatState,
  onUpdate: (state: ChatState) => void,
): Promise<string | null> {
  const response = await fetch("/api/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      tenantId: "default",
      userId: "user-1",
      sessionId: state.sessionId ?? undefined, // pass existing session to continue it
    }),
  });

  if (!response.ok) {
    throw new Error(`Stream request failed: ${response.status}`);
  }

  // Capture the session ID for subsequent requests
  const returnedSessionId = response.headers.get("X-Session-Id");

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  onUpdate({ ...state, isStreaming: true, text: "" });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep incomplete last line

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;

      try {
        const event = JSON.parse(raw) as AgentrailEvent;
        state = handleEvent(event, state);
        onUpdate(state);
      } catch {
        // malformed line — skip
      }
    }
  }

  onUpdate({ ...state, isStreaming: false });
  return returnedSessionId;
}
```

### Event handler

```ts
function handleEvent(event: AgentrailEvent, state: ChatState): ChatState {
  switch (event.type) {
    case "message.update":
      // Streaming text delta from the LLM
      return { ...state, text: state.text + (event.delta ?? "") };

    case "tool.before":
      return {
        ...state,
        tools: [...state.tools, { name: event.toolName, status: "running" }],
      };

    case "tool.after":
      return {
        ...state,
        tools: state.tools.map((t) => (t.status === "running" ? { ...t, status: "done" } : t)),
      };

    case "context_usage":
      return { ...state, budgetUsedPct: event.budgetUsedPct ?? null };

    case "context_compaction_start":
      console.log("Compacting session history...");
      return state;

    case "context_compaction_end":
      console.log("Compaction complete.");
      return state;

    case "session.end":
      return { ...state, isStreaming: false };

    case "error":
      console.error("Stream error:", event.error.message);
      return { ...state, isStreaming: false };

    default:
      return state;
  }
}
```

---

## Session Continuity

The host returns `X-Session-Id` in the response headers. Store it and pass it in subsequent requests to continue the same session:

```ts
let sessionId: string | null = null;

async function chat(message: string) {
  const newSessionId = await sendMessage(
    message,
    { sessionId, text: "", isStreaming: false, tools: [], budgetUsedPct: null },
    updateUI,
  );
  if (newSessionId) {
    sessionId = newSessionId;
    localStorage.setItem("agentrail-session-id", sessionId);
  }
}

// Restore session from storage on page load
sessionId = localStorage.getItem("agentrail-session-id");
```

---

## Orchestration Events

When a profile uses orchestration (multi-agent workflows), additional events appear in the stream. Update a separate orchestration panel:

```ts
case "orchestration_run_start":
  initOrchestrationPanel(event.runId);
  break;

case "subagent_spawned":
  addSubagentCard({
    id: event.agent.agentId as string,
    status: "idle",
  });
  break;

case "subagent_status":
  updateSubagentCard(event.agentId, { status: event.status });
  break;

case "subagent_job_started":
  updateSubagentCard(event.agentId, { currentJob: event.jobId });
  break;

case "subagent_job_completed":
  updateSubagentCard(event.agentId, { currentJob: null });
  break;

case "orchestration_run_complete":
  markRunComplete(event.runId, event.status);
  break;
```

---

## Request/Response Chat (Non-Streaming)

For simpler interactions, use the `chat` endpoint. It returns a JSON body once the full response is ready:

```ts
async function chatNonStream(message: string): Promise<string> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      tenantId: "default",
      userId: "user-1",
      sessionId: sessionId ?? undefined,
    }),
  });

  const data = (await response.json()) as {
    text: string;
    sessionId: string;
    usage: { inputTokens: number; outputTokens: number };
    stopReason: string;
  };

  sessionId = data.sessionId;
  return data.text;
}
```

---

## What Is Framework-Level vs Example-Level

**Framework-level** (consumed by this UI):

- `chat` and `stream` route contracts exposed by `@agentrail/app`
- event shapes surfaced by `@agentrail/app` and the runtime
- the session-oriented request model

**Example-level** (specific to this UI):

- component composition and page layout
- local state management choices
- visual treatment of streamed progress and workflow state
- React hooks wrapping the fetch logic above

---

## Source Files To Read

Read in this order to understand the full client-server loop:

1. [Examples: Playground Server](playground-server.md) — how the server produces events
2. [examples/playground-ui/src/api.ts](https://github.com/yai-dev/agentrail/blob/main/examples/playground-ui/src/api.ts) — how the UI calls the API
3. [examples/playground-ui/src/App.tsx](https://github.com/yai-dev/agentrail/blob/main/examples/playground-ui/src/App.tsx) — top-level state and routing
4. [Reference: Events](../reference/events.md) — full event type reference

## Related Docs

- [Consume Stream (SSE) Guide](../guides/consume-stream.md)
- [Reference: Events](../reference/events.md)
- [Concepts: Host](../concepts/host.md)
- [Examples: Playground Server](playground-server.md)
