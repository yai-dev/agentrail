# Playground Server

The playground server is the main hosted example application in the repository. It is the clearest reference for how all Agentrail framework pieces fit together in a realistic host.

## What It Demonstrates

- mounting chat and stream routes via low-level primitives
- using `defineProfile` with capability descriptors
- plugin-based slash commands, attachment hints, and request hooks
- orchestration-aware streaming with trace persistence

## Why This Example Matters

The playground server is not just a demo. It is the current reference implementation for:

- how to wire Agentrail host routes
- how to assemble context providers, plugins, and orchestration in one place
- how to keep framework code separate from example-specific behavior

If you are building your own server, this example is usually a better starting point than reading individual packages in isolation.

---

## Key Code Patterns

### Route Mounting

The two host entry points are mounted in `routes/chat.ts` and `routes/stream.ts`. The playground example uses route primitives from `@agentrail/app/advanced` directly because it needs per-route customization beyond what `createAgentApp` exposes:

```ts
// examples/playground-server/src/routes/stream.ts (simplified)
import { createStreamRoute } from "@agentrail/app/advanced";
import { createFileSystemSessionTraceStore } from "@agentrail/app";
import { resolvePlaygroundProfile } from "../profiles/default-profile.js";
import { sessionManager, sandboxManager, orchestrationRegistry } from "../context/index.js";
import { plugins } from "../plugins/index.js";
import { summarize } from "../agents/summarizer.js";

export const streamRoute = createStreamRoute({
  dataDir,
  defaultAgentId: "default",
  sessionStore: sessionManager,
  sandboxManager,
  resolveProfile: resolvePlaygroundProfile,
  summarize,
  compaction: { triggerTokens: 80_000, minMessages: 20 },
  plugins,
  getOrchestrationManager: ({ tenantId, userId, sessionId, sessionRef }) =>
    orchestrationRegistry.getManager({ tenantId, userId, sessionId, sessionRef }),
  onTraceEvent: (ctx, envelope) => {
    const traceStore = createFileSystemSessionTraceStore(dataDir, ctx.sessionRef);
    void traceStore.appendEnvelope(envelope);
  },
});
```

Both chat and stream routes share the same session store, profile resolver, and plugin list — that reuse is the main design goal.

### Profile Definition

The default profile lives in `profiles/default-profile.ts`. It shows the recommended `defineProfile` shape with capability descriptors:

```ts
// examples/playground-server/src/profiles/default-profile.ts (simplified)
import { defineProfile, createStaticProfileResolver } from "@agentrail/app";
import { filesystem, browser, knowledge, skills, orchestration, memoryContext } from "@agentrail/capabilities";
import { knowledgeManager, sandboxManager, skillManager, orchestrationRegistry, sessionManager } from "../context/index.js";

export const defaultProfile = defineProfile({
  id: "agentrail-default-agent",
  name: "Agentrail Playground Assistant",
  agent: {
    model: `${config.provider}:${config.modelId}`,
    prompt: () => buildSystemPrompt(),
  },
  modelConfig: config.baseUrl ? { baseUrl: config.baseUrl } : undefined,
  capabilities: [
    filesystem({ sandboxManager }),
    browser({ sandboxManager }),
    knowledge(knowledgeManager),
    skills(skillManager, { mode: "delegate" }),
    orchestration(orchestrationRegistry, subAgentFactory),
    memoryContext({ buildMemoryIndex, listKnowledgeMetadatas, listSkills }, { cacheTtlMs: 5_000 }),
  ],
});

export const resolvePlaygroundProfile = createStaticProfileResolver([defaultProfile]);
```

### Plugin Assembly

Plugins live in `plugins/index.ts`. Each plugin owns one horizontal concern:

```ts
// examples/playground-server/src/plugins/index.ts (simplified)
import type { AgentrailPlugin } from "@agentrail/app";
import { slashCommandsPlugin } from "./slash-commands.js";
import { attachmentHintsPlugin } from "./attachment-hints.js";
import { userMemoryPlugin } from "./user-memory.js";

export const plugins: AgentrailPlugin[] = [
  slashCommandsPlugin, // intercepts /commands before the agent runs
  attachmentHintsPlugin, // injects file context for uploaded attachments
  userMemoryPlugin, // adds user memory notes to context
];
```

The `slashCommandsPlugin` uses `interceptChatRequest` to handle `/help`, `/reset`, and similar commands without invoking the LLM.

---

## Request Flow

1. Incoming request hits `POST /api/stream`
2. Host route resolves session and profile via `resolvePlaygroundProfile`
3. Plugins contribute interception (`interceptChatRequest`), lifecycle hooks, or attachment behavior
4. Capabilities build per-request context providers: memory index, KB summaries, skills list, workspace snapshot
5. The profile's `createAgent` constructs the runtime agent with capability tools
6. `agent.stream()` is called; runtime events are forwarded as SSE
7. Compaction runs if session history exceeds `triggerTokens`
8. Turn is persisted; `onTurnPersisted` hooks fire

## Chat vs Stream

Both routes share the same surrounding infrastructure. The stream route adds:

- `sandboxManager` for attachment persistence
- `getOrchestrationManager` for per-session orchestration
- `onTraceEvent` for trace persistence alongside session history
- SSE event forwarding for tool progress, compaction, and orchestration state

## Source Files To Read

| File                                                                                              | What it shows                           |
| ------------------------------------------------------------------------------------------------- | --------------------------------------- |
| [routes/stream.ts](../../examples/playground-server/src/routes/stream.ts)                        | Full `createStreamRoute` options        |
| [profiles/default-profile.ts](../../examples/playground-server/src/profiles/default-profile.ts) | `defineProfile` + capability descriptors |
| [prompts/index.ts](../../examples/playground-server/src/prompts/index.ts)                        | Fragment + bundle composition           |
| [plugins/index.ts](../../examples/playground-server/src/plugins/index.ts)                        | Plugin registration                     |
| [context/index.ts](../../examples/playground-server/src/context/index.ts)                        | Singleton managers                      |

## What Is Framework-Level vs Example-Level

Framework-level pieces:

- `@agentrail/core`, `@agentrail/capabilities`, `@agentrail/app`
- `@agentrail/deep-research`

Example-level pieces (replace these for your own app):

- system prompt content
- the concrete default profile identity
- slash command definitions
- attachment hint wording
- the specific combination of enabled routes and workflows

## How To Use This As A Template

1. Copy the route/profile/plugin structure, not the prompt content
2. Start with one profile and one bundle
3. Replace prompt content and app-specific plugins
4. Add custom route logic only after the basic host path is working

## Related Docs

- [Quickstart](../guides/quickstart.md)
- [Build a Profile](../guides/build-a-profile.md)
- [Manage Prompts](../guides/manage-prompts.md)
- [Use Capability Packages](../guides/use-capability-packages.md)
- [Compatibility APIs Reference](../reference/host-defaults.md)
