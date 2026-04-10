# Context & Compaction

Context providers inject request-time information into the agent's message list. Transform contexts rewrite the request-time history. Compaction manages the token budget by combining tool-result compaction, request-boundary session compaction, and in-loop reactive compaction.

## Context Providers

A `ContextProvider` is an async function that receives the current request context and returns an array of messages to prepend before the session history:

```ts
import type { ContextProvider } from "@agentrail/app";

const identityProvider: ContextProvider = async (context) => {
  return [
    {
      role: "user",
      content: `Tenant: ${context.tenantId}\nUser: ${
        context.userId
      }\nDate: ${new Date().toISOString()}`,
      timestamp: Date.now(),
    },
  ];
};
```

The messages returned by providers are inserted before the session's historical messages. They are not persisted — they are freshly computed on every request.

## Transform Contexts

A `TransformContextFn` rewrites the message history immediately before a model call. Unlike a `ContextProvider`, it can replace, summarize, or remove existing messages.

Typical transform use cases:

- compacting oversized tool results
- normalizing or redacting persisted history
- composing multiple history rewrites before provider injection

## What Goes in Context Providers

Context providers are the right place for:

- user identity, tenant, and date headers
- memory index summaries
- knowledge base summaries
- skills inventory context
- workspace snapshots

Context providers are **not** the right place for:

- content that belongs in the system prompt (put it in the prompt bundle)
- behavior that should be a tool
- large raw documents (use a summary or index entry instead)

## Context Pipeline

When a request arrives, the host first runs registered transform contexts in order, then runs all registered context providers against the rewritten history, and finally prepends the injected provider messages.

The pipeline is built with `createTransformContext` from `@agentrail/app/advanced`:

```ts
import { createTransformContext } from "@agentrail/app/advanced";

const transformContext = createTransformContext([
  identityProvider,
  memoryProvider,
  knowledgeProvider,
  workspaceProvider,
]);
```

Order matters. Identity and date headers should come first; memory and knowledge summaries should precede history; workspace snapshots should reflect the most current state.

If you have multiple rewrite functions, use `composeTransformContexts(...)` to run them left-to-right before provider injection.

## Defaults Layer

Use `memoryContext(...)` for the recommended high-level path. For lower-level composition, `createDefaultCapabilityContextProviders(...)` assembles the standard injected context stack and `createDefaultCapabilityTransformContext(...)` adds the companion rewrite transform:

```ts
import {
  createDefaultCapabilityContextProviders,
  createDefaultCapabilityTransformContext,
} from "@agentrail/capabilities";

const providers = createDefaultCapabilityContextProviders(options);
const transform = createDefaultCapabilityTransformContext(options);
```

This covers the typical provider set — memory summaries, knowledge summaries, skills index, and workspace snapshots — in the recommended order. The `memoryContext(...)` capability now contributes both injected context providers and a transform that can compact history before those providers run.

## Context Window Budget

The low-level profile contract supports a `contextWindow` field — the maximum number of tokens the model can handle in a single call. The host uses this value to:

- trim session history via `loadMessagesWithBudget` (keeping the most recent messages that fit)
- compute `budgetUsedPct` in SSE events so the client can show a context usage indicator

If you do not set it through a lower-level custom profile, the host defaults to `200_000`. Set it accurately when you implement `AgentrailProfile` directly so the token budget percentage shown to clients is correct.

## Compaction

Agentrail now uses three compaction layers:

- `compactToolResults(...)`: rewrites oversized `toolResult` messages and optionally persists their raw text to `tool-results/{toolCallId}.txt`
- request-boundary persisted compaction: summarizes old history at request start and archives the removed messages to `messages.compactions/*.jsonl`
- in-loop reactive compaction: summarizes old API rounds during a long-running turn, before the next model call would exceed the context window

### Request-Boundary Persisted Compaction

The host calls `compactIfNeeded` on the session store at the start of each request. If the accumulated history exceeds `triggerTokens`, it:

1. Loads the full session history
2. Calls your `summarize` function with the old messages
3. Replaces the old messages with a single summary message
4. Persists the compacted history

From the agent's perspective, the summary message appears as part of the conversation history. Future requests load the summary instead of the raw old turns.

### Reactive Compaction

Reactive compaction runs inside `agentLoop` and is driven by the profile `contextWindow` plus the previous turn's real prompt usage. It uses two strategies:

- `micro`: summarize only the oldest few API rounds while preserving the current user prompt and recent working set
- `full`: summarize the entire compactable prefix, used when prompt usage is very high or after a prompt-too-long error

The stream/runtime event for this path is `compaction`, while the host SSE events `context_compaction_start` and `context_compaction_end` remain exclusive to request-boundary persisted compaction.

### Configuration

Pass `summarize` and `compaction` to `createAgentApp`:

```ts
import type { Message } from "@agentrail/core";
import { createAgentApp } from "@agentrail/app";

// In production, replace this with a real LLM summarization call
const summarize = async (messages: Message[]) =>
  messages.map((m) => `${m.role}: ${JSON.stringify(m.content)}`).join("\n");

const app = createAgentApp({
  dataDir: DATA_DIR,
  profiles: [defaultProfile],
  summarize,
  compaction: {
    triggerTokens: 80_000, // compact when history exceeds this many tokens
    minMessages: 20, // only compact if there are at least this many messages
    reactive: {
      microTriggerPct: 85,
      fullTriggerPct: 92,
      preserveRecentApiRounds: 2,
      microBatchGroups: 2,
      maxReactiveCompactionsPerRequest: 3,
    },
  },
});
```

### The Summarize Function

The `summarize` function receives the old messages plus an optional reason and should return a concise text summary. In production this is usually an LLM call using a small, fast model:

```ts
const summarize = async (
  messages: Message[],
  ctx?: { reason: "session_compaction" | "reactive_micro" | "reactive_full" },
) => {
  const response = await llm.complete({
    system: `Summarize the following conversation history concisely. Reason: ${
      ctx?.reason ?? "session_compaction"
    }`,
    messages,
  });
  return response.text;
};
```

### Compaction Events

When request-boundary compaction runs, the stream route emits `context_compaction_start` and `context_compaction_end` over SSE. When in-loop reactive compaction runs, the runtime emits `compaction` with `messagesBefore` and `messagesAfter`.

## Related Concepts

- [Sessions](sessions.md)
- [Host](host.md)
- [Profiles](profiles.md)
- [Plugins](plugins.md)

## Related Reference

- [Session Store Reference](../reference/session-store.md)
- [Add Context Guide](../guides/add-context.md)
