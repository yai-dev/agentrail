# Orchestration

Orchestration lets a parent agent delegate work to multiple sub-agents and coordinate their outputs. It is the right layer for workflows that require parallel or sequential work distribution.

## When to Use Orchestration

Use orchestration when:

- a single agent turn is not enough to complete the task
- you need parallel research or processing by multiple specialized agents
- you need to aggregate results from multiple agents before responding

Do **not** use orchestration for single-agent tasks that can be solved with more tools or a longer system prompt.

## Core Concepts

### OrchestrationManager

`@agentrail/orchestration` provides the `OrchestrationManager`, which coordinates sub-agents for a single session. One manager instance exists per session, managed by the `OrchestrationRegistry` on the host.

### Run

A **run** is a single orchestration session. Only one run is active at a time per `OrchestrationManager`. A run starts with an initial task and ends when `completeRun` is called.

### Task

A **task** is a unit of work within a run. The initial task is provided when the run starts. Additional tasks can be derived as the workflow progresses.

### Sub-agent

A **sub-agent** is a managed child agent spawned by the parent agent using the `spawn-agent` tool. Sub-agents have their own lifecycle:

```
idle → running → waiting → closing → closed
```

- `idle` — spawned but not yet executing
- `running` — actively processing an input
- `waiting` — completed current work, waiting for more inputs
- `closing` — close was requested
- `closed` — finished and cleaned up

### WaitCondition

A **wait condition** blocks the parent agent until one or more sub-agents reach a desired state:

- `agent-closed` — the sub-agent finished all work and was closed
- `agent-idle` — the sub-agent completed its current input but may receive more

Wait conditions support `any` (at least one) or `all` (every specified agent) matching.

### Mailbox

Each sub-agent has a **mailbox** — a persisted event queue for inputs and close requests. The mailbox enables recovery: if the process restarts mid-orchestration, the manager replays events from disk to restore in-memory state and resume queued input delivery.

## Orchestration Tools

From the parent agent's perspective, orchestration is accessed through four runtime tools. These are injected by the host layer:

| Tool          | Purpose                                  |
| ------------- | ---------------------------------------- |
| `spawn-agent` | Create a sub-agent and assign it a role  |
| `send-input`  | Send a work item to a sub-agent          |
| `wait-agent`  | Block until agents reach a desired state |
| `close-agent` | Terminate a sub-agent                    |

The parent agent calls these tools like any other tool. The orchestration manager handles the actual coordination.

## Typical Flow

```ts
// 1. Start a run
await manager.startRun({
  runId: "run-1",
  initialTask: { id: "task-1", kind: "research", input: { query: "..." } },
});

// 2. Spawn sub-agents
await manager.spawnAgent({ id: "worker-1", role: "researcher" });
await manager.spawnAgent({ id: "worker-2", role: "researcher" });

// 3. Send work
await manager.sendInput({
  id: "input-1",
  agentId: "worker-1",
  payload: { instruction: "Research topic A" },
});
await manager.sendInput({
  id: "input-2",
  agentId: "worker-2",
  payload: { instruction: "Research topic B" },
});

// 4. Wait for completion
await manager.waitForAgents({
  id: "wait-1",
  agentIds: ["worker-1", "worker-2"],
  kind: "agent-idle",
  match: "all",
});

// 5. Close sub-agents
await manager.closeAgent({ id: "close-1", agentId: "worker-1" });
await manager.closeAgent({ id: "close-2", agentId: "worker-2" });

// 6. Complete the run
await manager.completeRun({ status: "completed" });
```

## Recovery

Orchestration state is persisted to disk as an event log with periodic checkpoint snapshots. When the `OrchestrationManager` starts, it replays the event log to restore:

- the active run and task state
- all sub-agent states and mailboxes
- any undelivered inputs

This means orchestration workflows survive process restarts — the manager reconnects to sub-agents that were still running and resumes queued work.

## Host Integration

The host exposes orchestration via the `OrchestrationRegistry`, which manages one `OrchestrationManager` per session:

```ts
import { createOrchestrationRegistry } from "@agentrail/host";

const orchestrationRegistry = createOrchestrationRegistry({
  getOrCreateManager: async (sessionId) => {
    // return or create the OrchestrationManager for this session
  },
});
```

The `createDefaultOrchestrationBinding` helper from `@agentrail/host/defaults` wires this together with hosted profiles automatically.

## Orchestration vs Plugins

Orchestration is for **multi-agent work distribution**. Plugins are for **cross-cutting host behavior**. Do not use a plugin to coordinate agents — that is orchestration's job.

## Related Concepts

- [Agents](agents.md)
- [Tools](tools.md)
- [Events](events.md)
- [Host](host.md)

## Related Reference

- [Multi-Agent Guide](../guides/multi-agent.md)
- [Deep Research Example](../examples/deep-research.md)
- [Host Primitives Reference](../reference/host-primitives.md)
