# Profile Contract Reference

Profiles are the bridge between the host layer and runtime agents.

## When To Read This Page

Read this page when:

- you are deciding what belongs inside a profile
- you need to understand the `AgentrailProfile` low-level contract
- you want to keep profile boundaries clean as your app grows

## Mental Model

The host asks one question for every request:

> Which profile should handle this request, and how do I build its agent?

That means a profile sits between:

- host request lifecycle code
- runtime agent construction

Profiles are not route objects and they are not plugins. They are the contract for _agent identity and assembly_.

## Recommended API — `defineProfile`

The recommended way to define profiles. Import from `@agentrail/app`:

```ts
import { defineProfile } from "@agentrail/app";
import { defineAgent } from "@agentrail/core";
```

### Static shape

```ts
export const analyticsProfile = defineProfile({
  id: "analytics",
  name: "Analytics Agent",
  agent: {
    model: "openai:gpt-4o",
    prompt: async (ctx) => loadSystemPrompt(ctx.tenantId),
    maxTurns: 20,
  },
  capabilities: [filesystem({ sandboxManager })],
});
```

### Dynamic shape (per-request agent factory)

```ts
export const analyticsProfile = defineProfile({
  id: "analytics",
  name: "Analytics Agent",
  async createAgent(ctx) {
    const system = await loadSystemPrompt(ctx.tenantId);
    return defineAgent({
      id: "analytics",
      model: { provider: "openai", modelId: "gpt-4o" },
      system,
      maxTurns: 20,
    });
  },
  capabilities: [filesystem({ sandboxManager })],
  modelConfig: { provider: "openai", modelId: "gpt-4o" },
});
```

## Base Contract — `AgentrailProfile`

The low-level profile contract is defined by `AgentrailProfile` in:

- [packages/app/src/host/types.ts](https://github.com/yai-dev/agentrail/blob/main/packages/app/src/host/types.ts)

```ts
interface AgentrailProfileContext {
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionRef: SessionRef;
  sessionStore: AgentrailSessionStore;
  /** Stable correlation ID for the entire request chain.
   * When provided, it flows into CapabilityBuildContext.tracing.chainId and
   * AgentRunOptions.chainId so that RuntimeEvent.chainId equals the route-level
   * traceId. Sub-agent events inherit the same chainId with depth incremented. */
  chainId?: string;
  /**
   * Active permission policy for this session.  When present, all file and
   * shell tools — both sandboxed (Bash, Read, Write, Edit) and non-sandboxed
   * — evaluate it via `checkPermissions` before executing.  Propagated
   * automatically by `defineProfile` into `CapabilityBuildContext.permissionPolicy`.
   */
  permissionPolicy?: ToolPermissionPolicy;
}

interface AgentrailProfile {
  id: string;
  name: string;
  /** Context window size in tokens. Defaults to 200_000. */
  contextWindow?: number;
  createAgent(
    context: AgentrailProfileContext,
    onSubAgentEvent?: (event: object) => void,
  ): Promise<Agent>;
  getContextProviders?(
    context: AgentrailProfileContext,
  ): Promise<ContextProvider[]> | ContextProvider[];
  getTransformContext?(
    context: AgentrailProfileContext,
  ): Promise<TransformContextFn> | TransformContextFn;
}
```

At the primitive level, a profile must provide `id`, `name`, and `createAgent`. `defineProfile` handles all of this automatically.

### `contextWindow`

Optional. The model's context window size in tokens. Defaults to `200_000`.

The stream route uses this value to compute `budgetUsedPct` in SSE events. Set it to the actual limit of the model used by this profile.

This field belongs to the low-level `AgentrailProfile` contract. `defineProfile` does not currently expose `contextWindow` as a helper option, so you only set it when implementing a custom profile object directly.

## `ProfileDefinition`

`defineProfile` returns a `ProfileDefinition` which extends `AgentrailProfile` with:

```ts
interface ProfileDefinition extends AgentrailProfile {
  readonly capabilities?: CapabilityDescriptor[];
  readonly modelConfig?: Partial<ModelConfig>;
}
```

The `capabilities` field is used by `createAgentApp` when constructing context providers and capability-level request transforms.

## Profile Resolver

To supply a custom resolver, implement `ProfileResolver`:

```ts
import type { ProfileResolver } from "@agentrail/app";

export const resolveProfile: ProfileResolver = async ({ agentId, tenantId }) => {
  // Tenant-aware profile selection
  return await loadProfileForTenant(agentId, tenantId);
};
```

Pass it to `createAgentApp({ resolveProfile })` or directly to `createChatRoute` / `createStreamRoute` from `@agentrail/app/advanced`.

For a static list, use `createStaticProfileResolver`:

```ts
import { createStaticProfileResolver } from "@agentrail/app";

const resolveProfile = createStaticProfileResolver([analyticsProfile, supportProfile]);
```

## Good Profile Boundaries

A well-shaped profile usually owns:

- agent identity
- prompt integration
- agent creation
- profile-local context additions

A well-shaped profile usually does **not** own:

- session persistence
- HTTP request parsing
- server startup
- plugin lifecycle
- unrelated background jobs

## Repository Example

The current recommended example is:

- [examples/playground-server/src/profiles/default-profile.ts](https://github.com/yai-dev/agentrail/blob/main/examples/playground-server/src/profiles/default-profile.ts)

That file shows:

- `defineProfile` with a static agent config
- prompt function that renders per-request
- capability descriptors for filesystem, browser, knowledge, skills, and orchestration
- registration via `createStaticProfileResolver`

## Common Mistakes

Avoid these patterns:

- putting route setup or plugin startup inside a profile
- reading environment variables directly in profile logic when that config belongs to the app
- making one giant profile do the work of multiple clearly different agents
- duplicating nearly identical profiles instead of using prompt vars or tool options

## Recommendation

Keep profile objects declarative and keep non-profile infrastructure outside profile definitions.

When in doubt, ask:

> Is this about how to build the agent, or is it about how to run the server?

If it is the latter, it probably does not belong in the profile.

## Related Docs

- [Build a Profile](../guides/build-a-profile.md)
- [Compatibility APIs Reference](host-defaults.md)
- [Host Primitives Reference](host-primitives.md)
