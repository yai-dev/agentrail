# `wait_agent`

Wait for one or more orchestration agents to satisfy a condition.

**Package:** `@agentrail/capabilities` (orchestration)

> This tool is available only when the multi-agent orchestration capability is enabled.

## Parameters

| Name          | Type               | Required | Description                                                                    |
| ------------- | ------------------ | -------- | ------------------------------------------------------------------------------ |
| `id`          | `string`           | Yes      | Unique wait-condition ID chosen by the orchestrator.                           |
| `agentId`     | `string`           | Yes      | Primary orchestration agent ID to wait on.                                     |
| `agentIds`    | `string[]`         | No       | Optional set of additional agent IDs to include in the wait.                   |
| `kind`        | `string`           | Yes      | Condition kind: `"agent-closed"` or `"agent-idle"`.                            |
| `description` | `string`           | Yes      | Human-readable description of what is being waited for.                        |
| `match`       | `"any"` \| `"all"` | No       | Whether `any` or `all` agents must satisfy the condition. Defaults to `"all"`. |
| `timeoutAt`   | `string`           | No       | Optional ISO-8601 timestamp at which the wait times out.                       |

### Condition kinds

| Kind             | Waits until...                                                    |
| ---------------- | ----------------------------------------------------------------- |
| `"agent-closed"` | The agent is explicitly closed via `close_agent`.                 |
| `"agent-idle"`   | The agent completes its current task (becomes idle or is closed). |

## Result

```ts
{
  waitId: string;
  agentId: string;
  status: string;
  kind: string;
  match: "any" | "all";
  resolution?: unknown;
}
```

## Usage notes

- Use `wait_agent` to synchronize between the orchestrator and sub-agents before proceeding with work that depends on their output.
- Prefer `"agent-idle"` when you want to collect results from a sub-agent while it may continue to run later.
- Prefer `"agent-closed"` when you need to know the sub-agent has fully terminated.
- Use `match: "any"` when you want to proceed as soon as at least one agent in `agentIds` finishes.

## Example

```ts
// Wait for a single agent to close
{
  id: "wait-1",
  agentId: "researcher-1",
  kind: "agent-closed",
  description: "Waiting for research agent to finish and close."
}

// Wait for any one of several agents to become idle
{
  id: "wait-2",
  agentId: "writer-1",
  agentIds: ["writer-1", "writer-2", "writer-3"],
  kind: "agent-idle",
  match: "any",
  description: "Waiting for the first writer agent to complete its draft."
}
```

## Related

- [spawn_agent](spawn-agent.md)
- [send_input](send-input.md)
- [close_agent](close-agent.md)
- [Multi-Agent Orchestration](../guides/multi-agent.md)
