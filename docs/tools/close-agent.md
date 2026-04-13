# `close_agent`

Close an orchestration sub-agent and resolve dependent waits.

**Package:** `@agentrail/capabilities` (orchestration)

> This tool is available only when the multi-agent orchestration capability is enabled.

## Parameters

| Name      | Type     | Required | Description                                           |
| --------- | -------- | -------- | ----------------------------------------------------- |
| `id`      | `string` | Yes      | Unique close-request ID chosen by the orchestrator.   |
| `agentId` | `string` | Yes      | Target orchestration agent ID to close.               |
| `reason`  | `string` | No       | Optional human-readable reason for closing the agent. |

## Result

```ts
{
  agentId: string;
  status: string;
  reason: string | null;
}
```

Closing an agent resolves any `wait_agent` calls that were waiting on it.

## Usage notes

- Call `close_agent` when a sub-agent has finished its assigned work.
- The `reason` field is surfaced in the orchestration UI and trace logs.
- Once closed, an agent cannot be re-used. Spawn a new agent for subsequent tasks.

## Example

```ts
{ id: "close-1", agentId: "researcher-1", reason: "Research phase complete." }
```

## Related

- [spawn_agent](spawn-agent.md)
- [wait_agent](wait-agent.md)
- [Multi-Agent Orchestration](../guides/multi-agent.md)
