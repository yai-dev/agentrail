# Multi-Agent

Use `@agentrail/orchestration` when one hosted agent needs delegated work.

## Prerequisites

Read this guide after:

- [Quickstart](quickstart.md)
- [Concepts: Events and Orchestration](../concepts/events-and-orchestration.md)
- [Host Primitives Reference](../reference/host-primitives.md)

## Typical Workflow

1. Create or reuse an orchestration manager
2. Spawn sub-agents
3. Send work items
4. Wait for completion or idle state
5. Close sub-agents when work is done

Deep Research is the main example of this pattern in the repository.

## Next Step

If you want a concrete reference implementation, continue with [Deep Research Example](../examples/deep-research.md).
