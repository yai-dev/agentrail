# Playground Server

The playground server is the main hosted example application in the repository. It is the clearest reference for how all Agentrail framework pieces fit together in a realistic host.

## What It Demonstrates

- mounting chat and stream routes
- using hosted profiles with the defaults layer
- using default capability builders (sandbox, knowledge, skills)
- plugin-based slash commands, attachment hints, and request hooks
- orchestration-aware streaming with trace persistence

## Why This Example Matters

The playground server is not just a demo. It is the current reference implementation for:

- how to mount Agentrail host routes
- how to assemble context providers, plugins, and orchestration in one place
- how to keep framework code separate from example-specific behavior

If you are building your own server, this example is usually a better starting point than reading individual packages in isolation.

---

## Key Code Patterns

### Route Mounting

The two host entry points are mounted in `routes/chat.ts` and `routes/stream.ts`. The stream route includes sandbox, orchestration, and trace persistence wiring:

```ts
// examples/playground-server/src/routes/stream.ts (simplified)
import { createStreamRoute } from "@agentrail/host";
import { resolveProfile } from "../profiles/index.js";
import { sessionStore, sandboxManager } from "../managers.js";
import { plugins } from "../plugins/index.js";
import { getContextProviders } from "../context/index.js";
import { summarize } from "../llm.js";

export const streamRoute = createStreamRoute({
  dataDir,
  defaultAgentId: "default",
  sessionStore,
  sandboxManager,
  resolveProfile,
  summarize,
  compaction: { triggerTokens: 80_000, minMessages: 20 },
  plugins,
  getContextProviders: async ({ tenantId, userId, sessionId }) =>
    getContextProviders({ tenantId, userId, sessionId }),
  getOrchestrationManager: async ({ tenantId, userId, sessionId }) =>
    orchestrationRegistry.getOrCreate(sessionId, tenantId, userId),
  onTraceEvent: (ctx, envelope) => {
    void persistTraceEvent(ctx, envelope);
  },
});
```

Both chat and stream routes share the same session store, profile resolver, and plugin list — that reuse is the main design goal.

### Profile Definition

The default profile lives in `profiles/default-profile.ts`. It shows the recommended shape:

```ts
// examples/playground-server/src/profiles/default-profile.ts (simplified)
import { defineAgent } from "@agentrail/runtime-core";
import { defineHostedProfile, createHostedProfileResolver, buildDefaultCapabilityTools } from "@agentrail/host/defaults";
import { createPromptBuilder } from "@agentrail/prompts";
import { bundle } from "../prompts/index.js";
import { knowledgeManager, sandboxManager, skillManager, waitHandleRegistry } from "../managers.js";

export const defaultProfile = defineHostedProfile({
  id: "default",
  name: "Default Agent",
  contextWindow: 200_000,

  promptBuilder: (ctx) => {
    const builder = createPromptBuilder(bundle);
    return builder.render({ vars: { sessionId: ctx.sessionId } });
  },

  createAgent: async (ctx) => {
    const modelConfig = {
      provider: "anthropic" as const,
      modelId: "claude-sonnet-4-5",
      apiKey: process.env.ANTHROPIC_API_KEY,
    };

    const { executionTools, browserTools, skillTool } = await buildDefaultCapabilityTools({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      sessionDir: ctx.sessionDir,
      knowledgeManager,
      sandboxManager,
      skillManager,
      waitHandleRegistry,
      modelConfig,
      includeSkillTool: true,
      delegateSkillsToSubAgent: true,
    });

    return defineAgent({
      id: "default",
      model: modelConfig,
      system: await createPromptBuilder(bundle).render(),
      tools: [...executionTools, ...browserTools, ...(skillTool ? [skillTool] : [])],
      maxTurns: 50,
    });
  },
});

export const resolveProfile = createHostedProfileResolver([defaultProfile]);
```

### Prompt Assembly

The system prompt lives in `prompts/index.ts`. It shows file-backed fragments and bundle composition:

```ts
// examples/playground-server/src/prompts/index.ts (simplified)
import { definePromptFragment, definePromptBundle } from "@agentrail/prompts";

const behaviorFragment = definePromptFragment({
  key: "base.behavior",
  filePath: new URL("./base/behavior.md", import.meta.url).pathname,
});

const capabilityFragment = definePromptFragment({
  key: "capability.tools",
  filePath: new URL("./capabilities/tools.md", import.meta.url).pathname,
});

const personaFragment = definePromptFragment({
  key: "profile.persona",
  filePath: new URL("./profiles/default.md", import.meta.url).pathname,
});

export const bundle = definePromptBundle({
  base: { fragments: [behaviorFragment] },
  capability: { fragments: [capabilityFragment] },
  profile: { fragments: [personaFragment] },
});
```

### Plugin Assembly

Plugins live in `plugins/index.ts`. Each plugin owns one horizontal concern:

```ts
// examples/playground-server/src/plugins/index.ts (simplified)
import type { AgentrailPlugin } from "@agentrail/host";
import { slashCommandsPlugin } from "./slash-commands.js";
import { attachmentHintsPlugin } from "./attachment-hints.js";
import { userMemoryPlugin } from "./user-memory.js";

export const plugins: AgentrailPlugin[] = [
  slashCommandsPlugin,     // intercepts /commands before the agent runs
  attachmentHintsPlugin,   // injects file context for uploaded attachments
  userMemoryPlugin,        // adds user memory notes to context
];
```

The `slashCommandsPlugin` uses `interceptChatRequest` to handle `/help`, `/reset`, and similar commands without invoking the LLM.

### Context Providers

Context assembly is in `context/index.ts`. It calls `createDefaultCapabilityContextProviders` with the per-request managers:

```ts
// examples/playground-server/src/context/index.ts (simplified)
import { createDefaultCapabilityContextProviders } from "@agentrail/host/defaults";

export async function getContextProviders({ tenantId, userId, sessionId }) {
  return createDefaultCapabilityContextProviders({
    tenantId,
    userId,
    sessionId,
    delegateSkillsToSubAgent: true,
    buildMemoryIndex: () => memoManager.buildIndex(tenantId, userId),
    listKnowledgeMetadatas: () => knowledgeManager.listAllMetadatas(tenantId),
    listSkills: () => skillManager.listSkills(),
    listWorkspaceSnapshot: () => sandboxManager.getWorkspaceSnapshot(sessionId),
  });
}
```

---

## Request Flow

1. Incoming request hits `POST /api/stream`
2. Host route resolves session and profile via `resolveProfile`
3. Plugins contribute interception (`interceptChatRequest`), lifecycle hooks, or attachment behavior
4. `getContextProviders` builds per-request context: memory index, KB summaries, skills list, workspace snapshot
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

| File                                                                                            | What it shows                         |
| ----------------------------------------------------------------------------------------------- | ------------------------------------- |
| [routes/stream.ts](../../examples/playground-server/src/routes/stream.ts)                       | Full `createStreamRoute` options      |
| [profiles/default-profile.ts](../../examples/playground-server/src/profiles/default-profile.ts) | `defineHostedProfile` + tool assembly |
| [prompts/index.ts](../../examples/playground-server/src/prompts/index.ts)                       | Fragment + bundle composition         |
| [plugins/index.ts](../../examples/playground-server/src/plugins/index.ts)                       | Plugin registration                   |
| [context/index.ts](../../examples/playground-server/src/context/index.ts)                       | Context provider wiring               |

## What Is Framework-Level vs Example-Level

Framework-level pieces:

- `@agentrail/host`, `@agentrail/host/defaults`
- `@agentrail/prompts`, `@agentrail/memo`
- `@agentrail/sandbox`, `@agentrail/orchestration`
- `@agentrail/plugin-user-memory`

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
- [Host Defaults Reference](../reference/host-defaults.md)
