# Profile Contract Reference

Hosted profiles are the bridge between the host layer and runtime agents.

## When To Read This Page

Read this page when:

- you are deciding what belongs inside a profile
- you need to choose between primitive and hosted profile shapes
- you want to keep profile boundaries clean as your app grows

They are one of the most important extension points in Agentrail because they define how an app-specific agent is exposed to the host runtime.

## Mental Model

The host asks one question for every request:

> Which profile should handle this request, and how do I build its agent?

That means a profile sits between:

- host request lifecycle code
- runtime agent construction

Profiles are not route objects and they are not plugins. They are the contract for *agent identity and assembly*.

## Base Contract

The low-level profile contract is defined by `AgentrailProfile` in:

- [packages/host/src/types.ts](../../packages/host/src/types.ts)

### `AgentrailProfile` interface

```ts
interface AgentrailProfileContext {
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionDir: string;
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
}
```

At the primitive level, a profile must provide:

- `id`
- `name`
- `createAgent(context, onSubAgentEvent?)`

That is the minimum required shape.

### `id`

The stable identifier used by the host to resolve the profile.

Use ids that are:

- short
- stable
- meaningful inside your app

### `name`

A human-readable display name for logs, UI, or diagnostics.

### `contextWindow`

Optional. The model's context window size in tokens. Defaults to `200_000`.

The stream route uses this value to compute `budgetUsedPct` in SSE events. Set it to the actual limit of the model used by this profile so the budget percentage displayed to clients is correct.

```ts
defineHostedProfile({
  id: "gpt4o",
  name: "GPT-4o",
  contextWindow: 128_000, // gpt-4o has 128k context
  createAgent: async (ctx) => defineAgent({ /* ... */ }),
});
```

### `createAgent`

This method constructs the runtime `Agent` instance for the request.

It receives:

- the profile context (`tenantId`, `userId`, `sessionId`, `sessionDir`)
- an optional sub-agent event sink

It should return a runtime agent ready to handle `invoke` or `stream`.

### Custom primitive profile example

```ts
import { defineAgent } from "@agentrail/runtime-core";
import type { AgentrailProfile, AgentrailProfileContext } from "@agentrail/host";

// Implement AgentrailProfile directly (no defaults layer)
export const analyticsProfile: AgentrailProfile = {
  id: "analytics",
  name: "Analytics Agent",
  contextWindow: 128_000,

  async createAgent(ctx: AgentrailProfileContext) {
    const system = await loadSystemPrompt(ctx.tenantId);
    const tools = await buildAnalyticsTools(ctx.sessionDir);

    return defineAgent({
      id: "analytics",
      model: {
        provider: "openai",
        modelId: "gpt-4o",
        apiKey: process.env.OPENAI_API_KEY,
      },
      system,
      tools,
      maxTurns: 20,
    });
  },
};

// Wire into a primitive resolver
import { createProfileResolver } from "@agentrail/host";

export const resolveProfile = createProfileResolver([analyticsProfile]);
```

## Recommended Contract

The defaults layer extends the primitive contract with `HostedProfileDefinition`, defined in:

- [packages/host/src/defaults/shared-types.ts](../../packages/host/src/defaults/shared-types.ts)

### `HostedProfileDefinition` interface

```ts
interface HostedProfileDefinition extends AgentrailProfile {
  /** Static system prompt string */
  prompt?: string;
  /** Dynamic system prompt — called per request with profile context */
  promptBuilder?: (context: AgentrailProfileContext) => string | Promise<string>;
  /** Additional context providers for this profile's requests */
  getContextProviders?: (
    context: AgentrailProfileContext,
  ) => Promise<ContextProvider[]> | ContextProvider[];
  /** Intercept a chat request before the agent runs */
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

This lets a profile stay declarative while still carrying the most common hosted-app extensions.

## Primitive Profile vs Hosted Profile

Use the primitive profile contract when:

- you want maximum control
- you are building custom host assembly
- you do not want the defaults layer involved

Use `defineHostedProfile` when:

- you want the recommended SDK path
- you want prompt/profile conventions to stay explicit
- you want `createHostedProfileResolver` to be the normal resolver path

## Resolution Contract

Profiles are typically consumed through a resolver function.

The default resolver builder is:

- [packages/host/src/defaults/profile.ts](../../packages/host/src/defaults/profile.ts)

Under the hood, that delegates to the primitive registry helper:

- [packages/host/src/profile-registry.ts](../../packages/host/src/profile-registry.ts)

This means you can:

- start with the defaults layer
- later wrap or replace the resolver if your selection logic becomes more complex

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

If a profile starts booting services or reading route-specific request details directly, the boundary is getting blurry.

## Repository Example

The current recommended example is:

- [examples/playground-server/src/profiles/default-profile.ts](../../examples/playground-server/src/profiles/default-profile.ts)

That file is useful because it shows:

- `defineHostedProfile`
- prompt SDK usage through a prompt builder
- resolver creation through `createHostedProfileResolver`
- a clean separation between profile declaration and route mounting

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
- [Host Defaults Reference](host-defaults.md)
- [Host Primitives Reference](host-primitives.md)
