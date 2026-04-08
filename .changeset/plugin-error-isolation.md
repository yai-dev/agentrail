---
"@agentrail/app": minor
---

Add per-plugin error isolation, `priority` ordering, and `onPluginError` observability callback.

All plugin hooks (`start`, `stop`, request lifecycle hooks, `interceptChatRequest`,
`attachmentHandler`) are now wrapped in individual try/catch blocks so that a throwing
plugin never propagates to the host request unless `critical: true` is set.

New fields on `AgentrailPlugin`:

- `priority?: number` — controls execution order (descending for start/request hooks,
  ascending for stop). Defaults to `0`.
- `critical?: boolean` — when `true`, errors in `interceptChatRequest` propagate and
  abort the request. Defaults to `false`.

New types exported from `@agentrail/app`:

- `PluginErrorContext` — payload passed to the error handler.
- `PluginErrorHandler` — callback type `(ctx: PluginErrorContext) => void | Promise<void>`.

New option `onPluginError?: PluginErrorHandler` on `CreateAgentAppOptions`,
`AgentrailChatRouteOptions`, and `AgentrailStreamRouteOptions`. Pass the same handler
to `runPluginLifecycle()` for unified error reporting across lifecycle and request-time paths.

The `runPluginLifecycle` signature gains an optional third parameter `onError?:
PluginErrorHandler`. Existing callers that omit it fall back to `console.warn` — no
breaking change.
