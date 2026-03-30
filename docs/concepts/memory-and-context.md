# Memory and Context

Agentrail separates persisted session history from injected runtime context.

## Session History

Session storage is responsible for:

- creating or resuming sessions
- loading messages
- appending messages
- recording usage
- compacting history when needed

## Context Injection

Context providers inject additional request-time messages such as:

- memory index summaries
- knowledge-base summaries
- skills index summaries
- workspace snapshots

The recommended SDK provides default builders for these patterns.
