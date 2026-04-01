# Context & Compaction

Context providers inject request-time information into the agent's message list. Compaction manages the token budget by summarizing old history when it gets too long.

## Context Providers

A `ContextProvider` is an async function that receives the current request context and returns an array of messages to prepend before the session history:

```ts
import type { ContextProvider } from "@agentrail/host";

const identityProvider: ContextProvider = async (context) => {
  return [
    {
      role: "user",
      content: `Tenant: ${context.tenantId}\nUser: ${context.userId}\nDate: ${new Date().toISOString()}`,
      timestamp: Date.now(),
    },
  ];
};
```

The messages returned by providers are inserted before the session's historical messages. They are not persisted — they are freshly computed on every request.

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

When a request arrives, the host runs all registered context providers in order and assembles their output into a list of messages. This list is prepended to the session history before the agent sees it.

The pipeline is built with `createTransformContext` from `@agentrail/host`:

```ts
import { createTransformContext } from "@agentrail/host";

const transformContext = createTransformContext([
  identityProvider,
  memoryProvider,
  knowledgeProvider,
  workspaceProvider,
]);
```

Order matters. Identity and date headers should come first; memory and knowledge summaries should precede history; workspace snapshots should reflect the most current state.

## Defaults Layer

Use `createDefaultCapabilityContextProviders` from `@agentrail/host/defaults` to assemble the standard capability context stack:

```ts
import { createDefaultCapabilityContextProviders } from "@agentrail/host/defaults";

const contextProviders = createDefaultCapabilityContextProviders({
  memory: memoryManager,
  knowledge: knowledgeManager,
  skills: skillsManager,
  sandbox: sandboxManager,
});
```

This covers the typical provider set — memory summaries, knowledge summaries, skills index, and workspace snapshots — in the recommended order.

## Context Window Budget

Each profile declares a `contextWindow` — the maximum number of tokens the model can handle in a single call. The host uses this value to:

- trim session history via `loadMessagesWithBudget` (keeping the most recent messages that fit)
- compute `budgetUsedPct` in SSE events so the client can show a context usage indicator

```ts
defineHostedProfile({
  id: "default",
  contextWindow: 200_000, // actual limit of the model used by this profile
  // ...
});
```

If `contextWindow` is not set, it defaults to `200_000`. Set it accurately so the token budget percentage shown to clients is correct.

## Compaction

Even with budget-based history loading, very long sessions accumulate more history than fits in the context window. Compaction addresses this by summarizing old turns into a compact summary message.

### How It Works

The host calls `compactIfNeeded` on the session store at the start of each request. If the accumulated history exceeds `triggerTokens`, it:

1. Loads the full session history
2. Calls your `summarize` function with the old messages
3. Replaces the old messages with a single summary message
4. Persists the compacted history

From the agent's perspective, the summary message appears as part of the conversation history. Future requests load the summary instead of the raw old turns.

### Configuration

Pass `summarize` and `compaction` to `createChatRoute` or `createStreamRoute`:

```ts
import type { Message } from "@agentrail/runtime-core";

// In production, replace this with a real LLM summarization call
const summarize = async (messages: Message[]) =>
  messages.map((m) => `${m.role}: ${JSON.stringify(m.content)}`).join("\n");

app.route("/chat", createChatRoute({
  sessionStore,
  resolveProfile,
  summarize,
  compaction: {
    triggerTokens: 80_000,   // compact when history exceeds this many tokens
    minMessages: 20,         // only compact if there are at least this many messages
  },
}));
```

### The Summarize Function

The `summarize` function receives the old messages and should return a concise text summary. In production this is usually an LLM call using a small, fast model:

```ts
const summarize = async (messages: Message[]) => {
  const response = await llm.complete({
    system: "Summarize the following conversation history concisely.",
    messages,
  });
  return response.text;
};
```

### Compaction Events

When compaction runs, the stream route emits `context_compaction_start` and `context_compaction_end` events over SSE so the client can display a compaction indicator to the user.

## Related Concepts

- [Sessions](sessions.md)
- [Host](host.md)
- [Profiles](profiles.md)
- [Plugins](plugins.md)

## Related Reference

- [Session Store Reference](../reference/session-store.md)
- [Add Context Guide](../guides/add-context.md)
- [Host Defaults Reference](../reference/host-defaults.md)
