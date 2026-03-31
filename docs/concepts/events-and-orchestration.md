# Events and Orchestration

Agentrail uses events for observability and orchestration for delegated multi-agent work.

## Events

### Event Flow

```
runtime-core          host             SSE / WebSocket        UI
────────────          ────             ───────────────        ──
agent_start      ──►  wrap + forward  ──►  JSON stream   ──►  render
turn_start       ──►                  ──►                ──►
message_start    ──►                  ──►                ──►
message_update   ──►                  ──►                ──►  (text delta)
tool_exec_start  ──►                  ──►                ──►  (tool indicator)
tool_exec_end    ──►                  ──►                ──►
message_end      ──►                  ──►                ──►
turn_end         ──►                  ──►                ──►
agent_end        ──►                  ──►                ──►  (final usage)
```

The runtime core emits `RuntimeEvent` values during the agent loop. The host layer forwards these over SSE (for stream routes) or collects them into a final response (for chat routes).

### Key Runtime Event Types

| Event | When It Fires |
|-------|--------------|
| `agent_start` | Agent loop begins |
| `turn_start` / `turn_end` | Each LLM call round starts/finishes |
| `message_start` / `message_update` / `message_end` | LLM response streaming lifecycle |
| `tool_execution_start` / `tool_execution_end` | A tool call is being executed |
| `max_turns_reached` | Agent hit its turn limit |
| `waiting_for_user_input` | A tool needs user interaction |
| `agent_end` | Agent loop finishes, includes all new messages and total usage |
| `error` | An unrecoverable error occurred |

### Host-Level Events

The host layer adds its own events on top of runtime events:

- `context_compaction_start` / `context_compaction_end` — session history compaction
- `context_usage` — token budget status after a turn
- `orchestration_run_start` / `orchestration_run_complete` — multi-agent workflow lifecycle
- `subagent_spawned` / `subagent_status` / `subagent_closed` — sub-agent state changes

These are defined in `@agentrail/events`.

## Orchestration

The orchestration layer (`@agentrail/orchestration`) manages delegated sub-agents for workflows that need parallel or sequential work distribution.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Run** | A single orchestration session. Only one run is active at a time per `OrchestrationManager`. |
| **Task** | A unit of work within a run. Each run starts with an initial task. |
| **Agent** | A managed sub-agent that receives inputs and produces outputs. States: `idle → running → waiting → closing → closed`. |
| **WaitCondition** | A barrier that blocks until target agents reach a desired state (`agent-closed` or `agent-idle`). Supports `any` or `all` matching. |
| **Mailbox** | A per-agent event queue that persists inputs and close requests, enabling recovery after process restart. |

### Basic Pattern

The typical orchestration flow:

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
const result = await manager.waitForAgents({
  id: "wait-1",
  agentId: "worker-1",
  agentIds: ["worker-1", "worker-2"],
  kind: "agent-idle",
  description: "Wait for both researchers to finish",
  match: "all",
});

// 5. Close sub-agents
await manager.closeAgent({ id: "close-1", agentId: "worker-1" });
await manager.closeAgent({ id: "close-2", agentId: "worker-2" });

// 6. Complete the run
await manager.completeRun({ status: "completed" });
```

### Recovery

Orchestration state is persisted to disk (event log + checkpoint snapshots). When the `OrchestrationManager` is initialized, it replays events to recover the full in-memory state, reattaches active agents, and resumes queued input delivery.

### Runtime Tool Integration

From the agent's perspective, orchestration is accessed through tools:

- `spawn-agent` — create a sub-agent
- `send-input` — send a work item to a sub-agent
- `wait-agent` — block until agents reach a condition
- `close-agent` — terminate a sub-agent

These tools are provided by `@agentrail/orchestration` and assembled into the parent agent's toolset by the host layer.

## Related Concepts

- [Agents](agents.md)
- [Host](host.md)
- [Multi-Agent Guide](../guides/multi-agent.md)
- [Deep Research Example](../examples/deep-research.md)
