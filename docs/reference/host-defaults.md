# Compatibility APIs

> **Note:** The APIs on this page were the primary SDK path before Proposal #106. They remain available for backward compatibility from `@agentrail/app/compat`. For new applications, use `defineProfile` and `createAgentApp` from `@agentrail/app` instead.

## Migration

| Old API                                   | Replacement                                         |
| ----------------------------------------- | --------------------------------------------------- |
| `defineHostedProfile`                     | `defineProfile` from `@agentrail/app`               |
| `createHostedProfileResolver`             | `createStaticProfileResolver` from `@agentrail/app` |
| `buildDefaultCapabilityTools`             | `capabilities: [...]` in `defineProfile`            |
| `createDefaultCapabilityContextProviders` | `capabilities: [...]` in `defineProfile`            |
| `@agentrail/host`                         | `@agentrail/app/advanced`                           |
| `@agentrail/host/defaults`                | `@agentrail/app/compat`                             |

## Import Path

```ts
import {
  defineHostedProfile,
  createHostedProfileResolver,
  buildDefaultCapabilityTools,
} from "@agentrail/app/compat";
```

## `defineHostedProfile`

Defines a profile with explicit `createAgent` and optional prompt/context provider fields. Extends the low-level `AgentrailProfile` contract.

```ts
import { defineAgent } from "@agentrail/core";
import { defineHostedProfile } from "@agentrail/app/compat";

export const supportProfile = defineHostedProfile({
  id: "support",
  name: "Support Agent",

  promptBuilder: async (ctx) => {
    const builder = createPromptBuilder(myBundle);
    return builder.render({ vars: { sessionId: ctx.sessionId } });
  },

  createAgent: async (ctx) =>
    defineAgent({
      id: "support",
      model: { provider: "anthropic", modelId: "claude-sonnet-4-5" },
      system: "You are a helpful support assistant.",
      maxTurns: 30,
    }),
});
```

**Prefer `defineProfile` instead:**

```ts
import { defineProfile } from "@agentrail/app";

export const supportProfile = defineProfile({
  id: "support",
  name: "Support Agent",
  agent: {
    model: "anthropic:claude-sonnet-4-5",
    prompt: async (ctx) =>
      createPromptBuilder(myBundle).render({ vars: { sessionId: ctx.sessionId } }),
    maxTurns: 30,
  },
});
```

## `createHostedProfileResolver`

Builds a resolver function from a list of hosted profiles.

```ts
import { createHostedProfileResolver } from "@agentrail/app/compat";

export const resolveProfile = createHostedProfileResolver([supportProfile, researchProfile]);
```

**Prefer `createStaticProfileResolver` instead:**

```ts
import { createStaticProfileResolver } from "@agentrail/app";

export const resolveProfile = createStaticProfileResolver([supportProfile, researchProfile]);
```

## `buildDefaultCapabilityTools`

Builds the pre-Proposal-106 default capability toolset. Still used in some sub-agent runtimes that have not yet migrated to capability descriptors.

```ts
import { buildDefaultCapabilityTools } from "@agentrail/app/compat";

const { executionTools, browserTools } = await buildDefaultCapabilityTools({
  tenantId,
  userId,
  sessionId,
  sessionRef,
  sessionStore,
  knowledgeManager,
  sandboxManager,
  waitHandleRegistry,
  modelConfig,
  includeSkillTool: false,
});
```

**Prefer capability descriptors instead:**

```ts
import { defineProfile } from "@agentrail/app";
import { filesystem, knowledge } from "@agentrail/capabilities";

export const profile = defineProfile({
  id: "default",
  name: "Default",
  agent: { model: "anthropic:claude-sonnet-4-5", prompt: "..." },
  capabilities: [filesystem({ sandboxManager }), knowledge(knowledgeManager)],
});
```

## Related Docs

- [Host Primitives Reference](host-primitives.md)
- [Profile Contract Reference](profile-contract.md)
- [Build a Profile Guide](../guides/build-a-profile.md)
