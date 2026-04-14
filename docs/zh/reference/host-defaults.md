# 兼容 API

> 说明：本页中的 API 是 Proposal #106 之前的主要 SDK 接入方式。它们仍可通过 `@agentrail/app/compat` 使用，以保持向后兼容。新应用建议直接使用 `@agentrail/app` 中的 `defineProfile` 与 `createAgentApp`。

## 迁移关系

| 旧 API                                    | 替代方式                                            |
| ----------------------------------------- | --------------------------------------------------- |
| `defineHostedProfile`                     | `@agentrail/app` 中的 `defineProfile`               |
| `createHostedProfileResolver`             | `@agentrail/app` 中的 `createStaticProfileResolver` |
| `buildDefaultCapabilityTools`             | 在 `defineProfile` 中使用 `capabilities: [...]`     |
| `createDefaultCapabilityContextProviders` | 在 `defineProfile` 中使用 `capabilities: [...]`     |
| `@agentrail/host`                         | `@agentrail/app/advanced`                           |
| `@agentrail/host/defaults`                | `@agentrail/app/compat`                             |

## 导入方式

```ts
import {
  defineHostedProfile,
  createHostedProfileResolver,
  buildDefaultCapabilityTools,
} from "@agentrail/app/compat";
```

## `defineHostedProfile`

该 API 用于定义一个带显式 `createAgent` 的 Profile，并可附带 Prompt 或 `Context Provider` 字段。它扩展了底层 `AgentrailProfile` 契约。

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

更推荐的替代方式是 `defineProfile`：

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

用于基于一组 Hosted Profiles 生成 Resolver：

```ts
import { createHostedProfileResolver } from "@agentrail/app/compat";

export const resolveProfile = createHostedProfileResolver([supportProfile, researchProfile]);
```

现在更推荐使用 `createStaticProfileResolver`：

```ts
import { createStaticProfileResolver } from "@agentrail/app";

export const resolveProfile = createStaticProfileResolver([supportProfile, researchProfile]);
```

## `buildDefaultCapabilityTools`

用于构建 Proposal #106 之前的默认 capability 工具集。当前某些尚未迁移到 `Capability Descriptor` 的子 Agent Runtime 仍可能使用这一 API。

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

更推荐的替代方式是 `Capability Descriptors`：

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

## 相关文档

- [Host 原语](./host-primitives.md)
- [Profile 契约](./profile-contract.md)
- [构建 Profile](../guides/build-a-profile.md)
