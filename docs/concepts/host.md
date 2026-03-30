# Host

The host layer turns runtime agents into developer-facing server behavior.

## Responsibilities

- Parse chat and stream requests
- Resolve hosted profiles
- Load and persist session history
- Inject context providers
- Run plugin lifecycle hooks
- Forward orchestration and runtime events

## Entry Points

- `createChatRoute`
- `createStreamRoute`
- `@agentrail/host/defaults`

For most applications, start with the defaults layer and only drop to primitives when you need custom request handling.
