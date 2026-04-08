---
"@agentrail/core": minor
"@agentrail/app": minor
---

Rename `RuntimeEvent` discriminants to a dotted-namespace convention and stabilise public contracts.

**Breaking (minor):** All `RuntimeEvent` type strings have been renamed:

| Old | New |
|-----|-----|
| `agent_start` | `session.start` |
| `agent_end` | `session.end` |
| `turn_start` | `turn.start` |
| `turn_end` | `turn.complete` |
| `message_start` | `message.start` |
| `message_update` | `message.update` |
| `message_end` | `message.end` |
| `tool_execution_start` | `tool.before` |
| `tool_execution_update` | `tool.update` |
| `tool_execution_end` | `tool.after` |

New events added: `compaction`, `subagent.spawn`, `subagent.complete`.

Deprecated type aliases (`AgentStartEvent`, `AgentEndEvent`, `TurnStartEvent`, `TurnEndEvent`, etc.) are exported for migration and will be removed in the next major version.

`AgentrailPlugin` now has an optional `version?: string` field. `AgentrailSessionStore` and `AgentrailPlugin` interfaces gain comprehensive JSDoc.
