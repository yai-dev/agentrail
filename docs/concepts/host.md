# Host

The host layer turns runtime agents into developer-facing server behavior. It owns the HTTP lifecycle, session management, context assembly, plugin execution, and event forwarding.

## Responsibilities

When a request arrives, the host:

1. Parses and validates the request body
2. Resolves or creates the session
3. Resolves the profile and constructs the agent
4. Loads session history (within the token budget)
5. Runs context compaction if needed
6. Assembles context messages from providers
7. Runs plugin lifecycle hooks
8. Invokes the agent (chat or stream)
9. Persists the resulting turn
10. Returns the response or streams events

This lifecycle is consistent across both entry points. The difference is only in how the response is delivered.

## Two Entry Points

### `createChatRoute`

The non-streaming entry point. It runs the full request lifecycle, buffers the complete agent response, and returns a JSON reply.

Use it when:

- your client does not support SSE
- you need a simple request/response model
- you are building a webhook or server-to-server integration

### `createStreamRoute`

The streaming entry point. It runs the same lifecycle but forwards each runtime event to the client as a Server-Sent Events (SSE) stream.

It adds stream-specific behavior on top of the basic lifecycle:

- attachment persistence
- real-time SSE event forwarding
- proactive compaction signaling
- optional orchestration event forwarding

Use it when you need:

- incremental text deltas visible as the model generates
- live tool execution feedback
- compaction and budget visibility
- multi-agent orchestration event forwarding

## Abstraction Levels

`@agentrail/app` provides both a high-level entry point and lower-level primitives:

### Recommended — `createAgentApp`

The one-call entry point for most apps:

```ts
import { createAgentApp, SessionManager } from "@agentrail/app";

const { app } = createAgentApp({
  profiles: [defaultProfile],
  sessionManager: new SessionManager(DATA_DIR),
  summarize,
});
```

This mounts both `/chat` (JSON) and `/stream` (SSE) endpoints and wires the full request lifecycle.

### Low-Level Escape Hatches

Available from `@agentrail/app` when you need direct control:

- `createChatRoute` and `createStreamRoute` — mount individual route primitives
- `createHostedProfileResolver` — build a custom profile resolver
- `createTransformContext` — compose context providers into a transform function
- `createOrchestrationRegistry` — per-session orchestration manager registry
- `defineHostedProfile` — raw profile construction without the `defineProfile` conveniences

Use these when you need a custom request lifecycle, non-default profile resolution, or are integrating into an existing server architecture.

## Choosing a Path

```
New app or first host → use createAgentApp + defineProfile
│
├── Need custom request lifecycle?   → use createChatRoute / createStreamRoute directly
├── Need non-default profile logic?  → use createHostedProfileResolver
├── Need custom context ordering?    → use createTransformContext
└── Building a completely custom server? → use all low-level primitives
```

You do not have to choose one or the other wholesale. The most common pattern is to use `createAgentApp` for most of the stack and drop to primitives only for the part that needs custom behavior.

## Request Body Shape

Both routes accept a JSON body:

```ts
{
  message: string | ContentPart[];  // user message
  agentId?: string;                 // which profile to use (defaults to defaultAgentId)
  sessionId?: string;               // resume an existing session
  tenantId?: string;                // multi-tenant identifier
  userId?: string;                  // per-user identifier
  attachments?: Attachment[];       // uploaded files
}
```

## Related Concepts

- [Profiles](profiles.md)
- [Sessions](sessions.md)
- [Context & Compaction](context-and-compaction.md)
- [Plugins](plugins.md)
- [Events](events.md)

## Related Reference

- [Host Primitives Reference](../reference/host-primitives.md)
