# `send_input`

Queue structured input for an orchestration sub-agent.

**Package:** `@agentrail/capabilities` (orchestration)

> This tool is available only when the multi-agent orchestration capability is enabled.

## Parameters

| Name      | Type                      | Required | Description                                        |
| --------- | ------------------------- | -------- | -------------------------------------------------- |
| `id`      | `string`                  | Yes      | Unique queued-input ID chosen by the orchestrator. |
| `agentId` | `string`                  | Yes      | Target orchestration agent ID.                     |
| `payload` | `Record<string, unknown>` | Yes      | Structured payload delivered to the target agent.  |

## Result

```ts
{
  inputId: string;
  agentId: string;
  queued: true;
  jobId: null;
}
```

Input is queued in the target agent's mailbox. The tool returns immediately — it does not wait for the agent to process the input.

## Usage notes

- Use `wait_agent` after `send_input` when you need to block until the agent has processed the work.
- The `payload` can contain any JSON-serializable data — task descriptions, context, file paths, etc.
- Multiple inputs can be queued for the same agent; they are processed in order.

## Example

```ts
{
  id: "input-1",
  agentId: "researcher-1",
  payload: {
    task: "Summarize the following documents.",
    documentPaths: ["/workspace/doc1.pdf", "/workspace/doc2.pdf"]
  }
}
```

## Related

- [spawn_agent](spawn-agent.md)
- [wait_agent](wait-agent.md)
- [close_agent](close-agent.md)
- [Multi-Agent Orchestration](../guides/multi-agent.md)
