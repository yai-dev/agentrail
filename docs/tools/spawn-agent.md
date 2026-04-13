# `spawn_agent`

Spawn a session-scoped orchestration sub-agent for a task.

**Package:** `@agentrail/capabilities` (orchestration)

> This tool is available only when the multi-agent orchestration capability is enabled.

## Parameters

| Name          | Type     | Required | Description                                                                                       |
| ------------- | -------- | -------- | ------------------------------------------------------------------------------------------------- |
| `id`          | `string` | Yes      | Unique orchestration agent ID chosen by the orchestrator.                                         |
| `taskId`      | `string` | No       | Optional task ID the sub-agent belongs to. Omit to attach the sub-agent to the current root task. |
| `displayName` | `string` | No       | UI codename for the sub-agent. Auto-generated if omitted.                                         |
| `role`        | `string` | Yes      | Role or specialization for the sub-agent (e.g. `"researcher"`, `"writer"`).                       |

## Result

Returns a JSON object describing the spawned agent:

```ts
{
  agentId: string;
  displayName: string;
  status: string;
  role: string;
  taskId: string | null;
}
```

## Usage notes

- Each sub-agent runs an independent agent loop scoped to the current session.
- After spawning, use `send_input` to deliver work to the agent and `wait_agent` to block until it completes.
- Use `close_agent` when the sub-agent's work is done.
- Sub-agents inherit the orchestration context (chain ID and depth) of the spawning agent.

## Example

```ts
{ id: "researcher-1", role: "researcher", displayName: "Research Agent" }
```

## Related

- [close_agent](close-agent.md)
- [send_input](send-input.md)
- [wait_agent](wait-agent.md)
- [Multi-Agent Orchestration](../guides/multi-agent.md)
