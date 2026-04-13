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
import type { WorkflowTraceEventEnvelope } from "@agentrail/app";
import type { SessionRef } from "@agentrail/core";
import { resolvePlaygroundProfile } from "../profiles/default-profile.js";
import { sessionManager, sandboxManager, orchestrationRegistry } from "../context/index.js";
import { plugins } from "../plugins/index.js";
import { summarize } from "../agents/summarizer.js";

// Cache one trace store per session so the underlying file is opened once per
// process lifetime, not once per event.
const traceStoreCache = new Map<
  SessionRef,
  ReturnType<typeof createFileSystemSessionTraceStore<WorkflowTraceEventEnvelope>>
>();
function getTraceStore(sessionRef: SessionRef) {
  let store = traceStoreCache.get(sessionRef);
  if (!store) {
    store = createFileSystemSessionTraceStore<WorkflowTraceEventEnvelope>(dataDir, sessionRef);
    traceStoreCache.set(sessionRef, store);
  }
  return store;
}

export const streamRoute = createStreamRoute({
  dataDir,
  defaultAgentId: "default",
  sessionStore: sessionManager,
  sandboxManager,
  resolveProfile: resolvePlaygroundProfile,
  summarize,
  compaction: {
    triggerTokens: 80_000,
    minMessages: 20,
    reactive: {
      microTriggerPct: 85,
      fullTriggerPct: 92,
      preserveRecentApiRounds: 2,
      microBatchGroups: 2,
      maxReactiveCompactionsPerRequest: 3,
    },
  },
  plugins,
  getOrchestrationManager: ({ tenantId, userId, sessionId, sessionRef }) =>
    orchestrationRegistry.getManager({ tenantId, userId, sessionId, sessionRef }),
  onTraceEvent: (ctx, envelope) => {
    void getTraceStore(ctx.sessionRef).appendEnvelope(envelope);
  },
});
```

Both chat and stream routes share the same session store, profile resolver, and plugin list — that reuse is the main design goal.

### Inspector Route

The Inspector API is mounted as a sub-app. Pass an `InspectorDataSource` to `createInspectorRoute` — for filesystem-backed setups use `createFilesystemInspectorDataSource`; for database backends, pass a `PostgresInspectorDataSource` or your own implementation:

```ts
// examples/playground-server/src/main.ts (simplified)
import { createInspectorRoute, createFilesystemInspectorDataSource } from "@agentrail/app/advanced";

// Filesystem-backed (default playground setup)
app.route(
  "/__inspector",
  createInspectorRoute(createFilesystemInspectorDataSource(config.dataDir)),
);

// PostgreSQL backend — swap the data source, everything else stays the same
// import { PostgresInspectorDataSource } from "@agentrail/storage-postgres";
// app.route("/__inspector", createInspectorRoute(new PostgresInspectorDataSource(sql)));
```

`createInspectorRoute` is backend-agnostic: it only calls methods on the `InspectorDataSource` interface, so switching from filesystem to PostgreSQL is a one-line change.

### Profile Definition

The default profile lives in `profiles/default-profile.ts`. It shows the recommended `defineProfile` shape with capability descriptors:

```ts
// examples/playground-server/src/profiles/default-profile.ts (simplified)
import { compactToolResults, createStaticProfileResolver, defineProfile } from "@agentrail/app";
import {
  askUser,
  browser,
  createSubAgentProcess,
  filesystem,
  knowledge,
  memoryContext,
  orchestration,
  skills,
} from "@agentrail/capabilities";
import { config } from "../config.js";
import {
  knowledgeManager,
  sandboxManager,
  skillManager,
  orchestrationRegistry,
  sessionManager,
} from "../context/index.js";
import { waitHandleRegistry } from "../wait-handle-registry.js";
import { getWorkerPath } from "../agents/worker-path.js";

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
    skills(skillManager, {
      mode: config.skillDelegateToSubAgent ? "delegate" : "inline",
    }),
    askUser(waitHandleRegistry),
    orchestration(orchestrationRegistry, (input, ctx) =>
      createSubAgentProcess({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        sessionRef: ctx.sessionRef,
        dataDir: config.dataDir,
        input,
        workerPath: getWorkerPath(),
        runtimeConfig: { input },
        workerConfig: config.orchestration.subagent,
      }),
    ),
    memoryContext(
      {
        buildMemoryIndex: (ctx) =>
          sessionManager.buildMemoryIndex(ctx.tenantId, ctx.userId, ctx.sessionId),
        listKnowledgeMetadatas: async (ctx) => {
          const kbList = await knowledgeManager.listKbs(ctx.tenantId);
          return Promise.all(kbList.map((id) => knowledgeManager.getMetadata(ctx.tenantId, id)));
        },
        listSkills: () => skillManager.listSkills(),
        listWorkspaceSnapshot: (ctx) => sandboxManager.listWorkspace(ctx.sessionId),
        // Persists compacted tool results to the session store and refreshes
        // the live sandbox mirror so the agent can read the file immediately.
        writeToolResultArtifact: async (ctx, toolCallId, content) => {
          const sessionRef = `${ctx.tenantId}:${ctx.sessionId}`;
          await Promise.all([
            sessionManager.writeToolResultArtifact?.(sessionRef, toolCallId, content),
            sandboxManager.refreshMemoMirror(
              ctx.sessionId,
              `/workspace/memo/session/tool-results/${toolCallId}.txt`,
              content,
            ),
          ]);
        },
        compactMessages: (msgs, ctx) =>
          compactToolResults(msgs, { writeToolResultArtifact: ctx?.writeToolResultArtifact }),
        delegateSkillsToSubAgent: config.skillDelegateToSubAgent,
      },
      { cacheTtlMs: 5_000 },
    ),
  ],
});

export const resolvePlaygroundProfile = createStaticProfileResolver([defaultProfile]);
```

### Plugin Assembly

Plugins live in `plugins/index.ts`. Each plugin owns one horizontal concern:

```ts
// examples/playground-server/src/plugins/index.ts (simplified)
import { createUserMemoryPlugin } from "@agentrail/app";
import { userMemoryConsolidationService } from "../context/index.js";
import { createAttachmentHintsPlugin } from "./attachment-hints.js";
import { createSlashCommandsPlugin } from "./slash-commands.js";

export const playgroundPlugins = [
  createUserMemoryPlugin(userMemoryConsolidationService),
  createAttachmentHintsPlugin(),
  createSlashCommandsPlugin(),
];
```

The slash-commands plugin uses `interceptChatRequest` to handle `/help`, `/reset`, and similar commands without invoking the LLM. The user-memory plugin runs as a host concern rather than a profile concern.

---

## Request Flow

1. Incoming request hits `POST /api/stream`
2. Host route resolves session and profile via `resolvePlaygroundProfile`
3. Plugins contribute interception (`interceptChatRequest`), lifecycle hooks, or attachment behavior
4. Capabilities build per-request context providers and transforms: memory index, KB summaries, skills list, workspace snapshot, and tool-result compaction
5. The profile's `createAgent` constructs the runtime agent with capability tools
6. `agent.stream()` is called; runtime events are forwarded as SSE
7. Request-boundary compaction runs if session history exceeds `triggerTokens`; in-loop reactive compaction can also fire during a long turn
8. Turn is persisted; `onTurnPersisted` hooks fire

## Chat vs Stream

Both routes share the same surrounding infrastructure. The stream route adds:

- `sandboxManager` for attachment persistence
- `getOrchestrationManager` for per-session orchestration
- `onTraceEvent` for trace persistence alongside session history
- SSE event forwarding for tool progress, compaction, and orchestration state

## Source Files To Read

| File                                                                                                                                     | What it shows                            |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| [routes/stream.ts](https://github.com/yai-dev/agentrail/blob/main/examples/playground-server/src/routes/stream.ts)                       | Full `createStreamRoute` options         |
| [profiles/default-profile.ts](https://github.com/yai-dev/agentrail/blob/main/examples/playground-server/src/profiles/default-profile.ts) | `defineProfile` + capability descriptors |
| [prompts/index.ts](https://github.com/yai-dev/agentrail/blob/main/examples/playground-server/src/prompts/index.ts)                       | Fragment + bundle composition            |
| [plugins/index.ts](https://github.com/yai-dev/agentrail/blob/main/examples/playground-server/src/plugins/index.ts)                       | Plugin registration                      |
| [context/index.ts](https://github.com/yai-dev/agentrail/blob/main/examples/playground-server/src/context/index.ts)                       | Singleton managers                       |

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
