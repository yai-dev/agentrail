# Host Defaults Reference

`@agentrail/host/defaults` is the recommended SDK layer for building hosted Agentrail applications.

## When To Read This Page

Read this page when:

- you want the recommended SDK path for a new hosted app
- you need to understand what each defaults helper is responsible for
- you want to see the full option shape for `buildDefaultCapabilityTools`

If you are not yet sure whether you need direct primitives, start here.

## Purpose

The defaults layer answers a practical question:

> What is the default, recommended way to assemble a hosted Agentrail app?

It makes Agentrail feel like a framework by providing opinionated helpers for:

- defining hosted profiles without hand-writing resolver glue
- assembling common capability toolsets (sandbox, knowledge, skills)
- assembling common context injections
- wiring orchestration support in a consistent way

---

## Main APIs

- `defineHostedProfile`
- `createHostedProfileResolver`
- `buildDefaultCapabilityTools`
- `createDefaultCapabilityContextProviders`
- `createDefaultCapabilityTransformContext`

---

## `defineHostedProfile`

Defines a profile in the shape the defaults layer expects. Extends the low-level `AgentrailProfile` with optional fields for prompt building, context providers, and request handling overrides.

```ts
import { defineAgent } from "@agentrail/runtime-core";
import { defineHostedProfile } from "@agentrail/host/defaults";
import { createPromptBuilder } from "@agentrail/prompts";
import { myBundle } from "./prompts/index.js";

export const supportProfile = defineHostedProfile({
  id: "support",
  name: "Support Agent",

  // Optional: render system prompt per request (receives profile context)
  promptBuilder: async (ctx) => {
    const builder = createPromptBuilder(myBundle);
    return builder.render({ vars: { sessionId: ctx.sessionId } });
  },

  // Required: construct the runtime agent for the request
  createAgent: async (ctx) =>
    defineAgent({
      id: "support",
      model: {
        provider: "anthropic",
        modelId: "claude-sonnet-4-5",
        apiKey: process.env.ANTHROPIC_API_KEY,
      },
      system: "You are a helpful support assistant.",
      tools: [],
      maxTurns: 30,
    }),

  // Optional: add extra context providers beyond the defaults
  getContextProviders: (ctx) => [],

  // Optional: intercept a chat request before normal processing
  handleChat: async ({ request, sessionId }) => {
    if (request.message === "/status") {
      return { status: 200, body: { text: "Agent is healthy." } };
    }
    return null; // continue with normal flow
  },
});
```

### `HostedProfileDefinition` interface

```ts
interface HostedProfileDefinition extends AgentrailProfile {
  prompt?: string;
  promptBuilder?: (context: AgentrailProfileContext) => string | Promise<string>;
  getContextProviders?: (
    context: AgentrailProfileContext,
  ) => Promise<ContextProvider[]> | ContextProvider[];
  handleChat?: (context: {
    request: {
      message: string;
      mode?: string;
      tenantId: string;
      userId: string;
      sessionId?: string;
      agentId?: string;
    };
    agentId: string;
    tenantId: string;
    userId: string;
    sessionId: string;
    sessionDir: string;
    signal: AbortSignal;
  }) => Promise<AgentrailChatHandledResponse | null> | AgentrailChatHandledResponse | null;
}
```

---

## `createHostedProfileResolver`

Builds a resolver function from a list of hosted profiles. The resolver is passed to `createChatRoute` or `createStreamRoute`.

```ts
import { createHostedProfileResolver } from "@agentrail/host/defaults";
import { supportProfile, researchProfile } from "./profiles/index.js";

export const resolveProfile = createHostedProfileResolver([supportProfile, researchProfile]);

// resolveProfile("support", ctx) → supportProfile
// resolveProfile("research", ctx) → researchProfile
// resolveProfile("unknown", ctx) → null
```

Pass to route factories:

```ts
import { createStreamRoute } from "@agentrail/host";

app.route(
  "/api/stream",
  createStreamRoute({
    defaultAgentId: "support",
    resolveProfile,
    sessionStore,
    // ...
  }),
);
```

---

## `buildDefaultCapabilityTools`

Builds the default capability toolset used by the reference host. Returns execution tools (sandbox file I/O, bash, todos, ask-user, KB tools), browser tools, and an optional skill tool.

```ts
import { buildDefaultCapabilityTools } from "@agentrail/host/defaults";

const { executionTools, browserTools, skillTool } = await buildDefaultCapabilityTools({
  tenantId,
  userId,
  sessionId,
  sessionDir,
  knowledgeManager,
  sandboxManager,
  waitHandleRegistry,
  modelConfig,
  includeSkillTool: true,
  delegateSkillsToSubAgent: true,
  skillManager,
});

const tools = [...executionTools, ...browserTools, ...(skillTool ? [skillTool] : [])];
```

### `DefaultCapabilityToolOptions` interface

```ts
interface DefaultCapabilityToolOptions {
  /** Request-scoped identifiers */
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionDir: string;

  /** Capability managers (process-level singletons) */
  knowledgeManager: KnowledgeManager; // from @agentrail/knowledge
  sandboxManager: SandboxManager; // from @agentrail/sandbox
  waitHandleRegistry: WaitHandleRegistry; // from @agentrail/tools

  /** Model config for skill sub-agent delegation */
  modelConfig: ModelConfig;

  /** Tool inclusion options */
  includeSkillTool?: boolean; // default: true
  delegateSkillsToSubAgent?: boolean; // default: true — recommended for production

  /** Optional: required when includeSkillTool is true */
  skillManager?: SkillManager; // from @agentrail/skills

  /** Optional: forward sub-agent SSE events to the parent stream */
  onSubAgentEvent?: (event: ExtendedSseEvent) => void;

  /** Optional: path where skills are mounted inside skill sub-agent containers */
  containerSkillsDir?: string; // default: "/skills"

  /** Optional: directory for sub-agent log files */
  subAgentLogDir?: string; // default: "{sessionDir}/subagent-logs"
}
```

### Return shape

```ts
interface DefaultCapabilityTools {
  executionTools: RuntimeTool[]; // bash, read, write, edit, grep, todo, ask-user, KB tools
  browserTools: RuntimeTool[]; // navigate, scroll, action, content (sandbox browser)
  skillTool: RuntimeTool | null; // null when includeSkillTool is false or no skillManager
}
```

---

## `createDefaultCapabilityContextProviders`

Builds the context-provider stack that injects structured state (memory index, knowledge-base summaries, skills list, workspace snapshot) before the conversation history on every request.

```ts
import { createDefaultCapabilityContextProviders } from "@agentrail/host/defaults";

const contextProviders = await createDefaultCapabilityContextProviders({
  tenantId,
  userId,
  sessionId,
  delegateSkillsToSubAgent: true,
  buildMemoryIndex: () => memoManager.buildIndex(tenantId, userId),
  listKnowledgeMetadatas: () =>
    knowledgeManager
      .listKbs(tenantId)
      .then((ids) => Promise.all(ids.map((id) => knowledgeManager.getMetadata(tenantId, id)))),
  listSkills: () => skillManager.listSkills(),
  listWorkspaceSnapshot: () => sandboxManager.getWorkspaceSnapshot(sessionId),
});
```

### `DefaultCapabilityContextOptions` interface

```ts
interface DefaultCapabilityContextOptions {
  tenantId: string;
  userId: string;
  sessionId: string;
  includeSkillsContext?: boolean; // default: true
  delegateSkillsToSubAgent: boolean;
  cacheTtlMs?: number; // cache TTL for context provider results
  buildMemoryIndex(): Promise<MemoryIndex>;
  listKnowledgeMetadatas(): Promise<(KBMetadata | null)[]>;
  listSkills(): Promise<SkillMeta[]>;
  listWorkspaceSnapshot?(): Promise<string | undefined>;
  compactMessages?(messages: Message[]): Message[];
}
```

---

## `createDefaultCapabilityTransformContext`

Builds a `transformContext` function from the same options, for use when you are working with the `getTransformContext` option on `createChatRoute` / `createStreamRoute` instead of separate context providers.

```ts
import { createDefaultCapabilityTransformContext } from "@agentrail/host/defaults";

const getTransformContext = async ({ tenantId, userId, sessionId }) => {
  return createDefaultCapabilityTransformContext({
    tenantId,
    userId,
    sessionId,
    delegateSkillsToSubAgent: true,
    buildMemoryIndex: () => memoManager.buildIndex(tenantId, userId),
    listKnowledgeMetadatas: () => knowledgeManager.listAllMetadatas(tenantId),
    listSkills: () => skillManager.listSkills(),
  });
};
```

---

## Typical Assembly Pattern

Most hosted apps follow this order:

```ts
import { createStreamRoute, createChatRoute } from "@agentrail/host";
import {
  defineHostedProfile,
  createHostedProfileResolver,
  buildDefaultCapabilityTools,
  createDefaultCapabilityContextProviders,
} from "@agentrail/host/defaults";
import { SessionManager } from "@agentrail/memo";
import { KnowledgeManager } from "@agentrail/knowledge";
import { SandboxManager } from "@agentrail/sandbox";
import { SkillManager } from "@agentrail/skills";

// 1. Process-level singletons
const sessionStore = new SessionManager(dataDir);
const knowledgeManager = new KnowledgeManager(dataDir);
const sandboxManager = new SandboxManager(dataDir);
const skillManager = new SkillManager(dataDir);

// 2. Define profiles
const myProfile = defineHostedProfile({
  id: "default",
  name: "Default Agent",
  createAgent: async (ctx) =>
    defineAgent({
      /* ... */
    }),
});

// 3. Build resolver
const resolveProfile = createHostedProfileResolver([myProfile]);

// 4. Mount routes (capability tools built per-request inside createAgent)
app.route(
  "/api/stream",
  createStreamRoute({
    defaultAgentId: "default",
    sessionStore,
    sandboxManager,
    resolveProfile,
    summarize: async (msgs) => {
      /* LLM summarize call */
    },
    compaction: { triggerTokens: 80_000, minMessages: 20 },
    getContextProviders: async ({ tenantId, userId, sessionId }) =>
      createDefaultCapabilityContextProviders({ tenantId, userId, sessionId /* ... */ }),
  }),
);
```

---

## What The Defaults Layer Does Not Hide

You still provide:

- your session store instance
- your prompt content
- your runtime model / provider settings (API keys, model IDs)
- your plugins
- your domain-specific tools (beyond the default capability set)

You can also override one part at a time instead of replacing the whole layer.

## When To Drop Down To Primitives

Use `@agentrail/host` directly when you need:

- a custom request lifecycle
- non-default profile resolution rules
- custom context ordering rules
- a completely custom toolset builder

See [Host Primitives](host-primitives.md) for lower-level control.

## Related Docs

- [Host Primitives Reference](host-primitives.md)
- [Profile Contract Reference](profile-contract.md)
- [Use Capability Packages Guide](../guides/use-capability-packages.md)
- [Build a Profile Guide](../guides/build-a-profile.md)
