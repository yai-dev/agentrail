# Write a Plugin

Plugins are the recommended way to add cross-cutting host behavior.

## Prerequisites

Read this guide after:

- [Quickstart](quickstart.md)
- [Concepts: Plugins](../concepts/plugins.md)
- [Profile Contract Reference](../reference/profile-contract.md)

## Common Examples

- slash-command interception
- request activity tracking
- attachment hint injection
- background services

## Practical Rule

If a behavior touches multiple routes or multiple profiles, prefer a plugin over route-local glue.

## Next Step

After you understand the high-level fit, continue with [Plugin Contract Reference](../reference/plugin-contract.md).
