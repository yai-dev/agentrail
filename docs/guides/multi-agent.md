# Multi-Agent

Use `@agentrail/capabilities` when one hosted agent needs to delegate work to managed sub-agents.

## Prerequisites

Read this guide after:

- [Quickstart](quickstart.md)
- [Concepts: Events and Orchestration](../concepts/events.md)
- [Host Primitives Reference](../reference/host-primitives.md)

## When To Use Orchestration

Use orchestration when:

- A single agent cannot handle the full task alone
- Work can be parallelized across multiple sub-agents
- You need structured wait/completion semantics
- You want recovery from process restarts

If you just need a single agent with tools, orchestration is unnecessary.

## The Five-Step Pattern

### 1. Create an OrchestrationManager

The manager holds the full state of a run. It is created once per session and persists state to the session directory:

```ts
import { OrchestrationManager } from "@agentrail/capabilities";

const manager = await OrchestrationManager.create({
  sessionDir: "/path/to/session",
  runtime: agentFactory,
});
```

The `runtime` parameter is an `OrchestrationAgentFactory` — it knows how to create managed agent instances for each role.

### 2. Start a Run

Each orchestration session begins with a single run and an initial task:

```ts
await manager.startRun({
  runId: "run-1",
  initialTask: {
    id: "task-1",
    kind: "research",
    input: { query: "Explain quantum computing" },
  },
});
```

### 3. Spawn Sub-Agents and Send Work

Create sub-agents and send them inputs:

```ts
const worker = await manager.spawnAgent({
  id: "worker-1",
  role: "researcher",
});

await manager.sendInput({
  id: "input-1",
  agentId: "worker-1",
  payload: { instruction: "Research the basics of quantum computing" },
});
```

Each sub-agent has a mailbox. Inputs are queued and delivered one at a time. The manager tracks job starts and completions automatically.

### 4. Wait for Results

Block until sub-agents finish:

```ts
const result = await manager.waitForAgents({
  id: "wait-1",
  agentId: "worker-1",
  kind: "agent-idle",
  description: "Wait for researcher to finish",
});

// result.resolution contains the outcome
```

Wait supports `match: "all"` (default) or `match: "any"` for multiple agents:

```ts
await manager.waitForAgents({
  id: "wait-all",
  agentId: "worker-1",
  agentIds: ["worker-1", "worker-2", "worker-3"],
  kind: "agent-idle",
  description: "Wait for all researchers",
  match: "all",
});
```

You can also set `timeoutAt` for time-bounded waits.

### 5. Close Agents and Complete the Run

```ts
await manager.closeAgent({ id: "close-1", agentId: "worker-1" });
await manager.completeRun({ status: "completed" });
```

## How It Looks From the Agent Side

In a typical hosted setup, the parent agent does not call `OrchestrationManager` directly. Instead, the app layer provides orchestration tools when you include the `orchestration` capability in your profile:

```ts
import { defineProfile } from "@agentrail/app";
import { orchestration } from "@agentrail/capabilities";

export const orchestratorProfile = defineProfile({
  id: "orchestrator",
  name: "Orchestrator",
  agent: {
    model: "anthropic:claude-sonnet-4-5",
    prompt: "You are an orchestrator that coordinates sub-agents.",
  },
  capabilities: [orchestration(orchestrationRegistry, subAgentFactory)],
});
```

The available tools are:

| Tool          | Purpose                              |
| ------------- | ------------------------------------ |
| `spawn-agent` | Create a sub-agent with a role       |
| `send-input`  | Send a work item to a sub-agent      |
| `wait-agent`  | Block until agents reach a condition |
| `close-agent` | Shut down a sub-agent                |

The parent agent uses these tools like any other runtime tool. The host layer translates tool calls into `OrchestrationManager` method calls behind the scenes.

## State and Recovery

All orchestration events are persisted to disk as an append-only event log. On startup, `OrchestrationManager.create()` replays the log to reconstruct the full in-memory state.

This means:

- Sub-agent state survives process restarts
- Queued inputs are redelivered after recovery
- Pending waits are re-evaluated

## Subscribing to Events

Use `manager.subscribe()` to observe orchestration state changes in real-time:

```ts
const unsubscribe = manager.subscribe(({ event, snapshot }) => {
  console.log(event.type, snapshot.run?.status);
});
```

The host layer uses this to forward orchestration events to the UI via SSE.

## Repository Example

The Deep Research workflow is the main example of multi-agent orchestration in this repository. See [Deep Research Example](../examples/deep-research.md).

## Related Docs

- [Events and Orchestration](../concepts/events.md)
- [Host Primitives Reference](../reference/host-primitives.md)
- [Deep Research Example](../examples/deep-research.md)
