# Agents

In Agentrail, an agent is the runtime unit that receives input, calls models and tools, and returns messages or streamed events.

## Core Ideas

- `@agentrail/runtime-core` defines the base agent contract.
- Hosted applications usually wrap agents in a profile instead of exposing raw runtime agents directly.
- A hosted profile decides how an agent is created for a specific request context.

## Related Concepts

- [Profiles](profiles.md)
- [Host](host.md)
- [Events and Orchestration](events-and-orchestration.md)
