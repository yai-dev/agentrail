# Build a Profile

Use a profile when you want the host layer to manage agent construction for each request.

## Prerequisites

Read this guide after:

- [Quickstart](quickstart.md)
- [Profiles](../concepts/profiles.md)
- [Prompt SDK Reference](../reference/prompt-sdk.md)

A profile is the main boundary between:

- framework-level host/runtime code
- application-specific agent behavior

If you are building on Agentrail, the profile is usually where your app starts to become unique.

## What A Profile Owns

A profile should define:

- the profile id and display name
- the model (provider and model id)
- the system prompt (static string or dynamic function)
- optional tools and capabilities

A profile should usually **not** own:

- route mounting
- session storage
- sandbox lifecycle
- plugin startup/shutdown
- unrelated background jobs

Those belong to the host layer.

## Recommended Flow

The usual path looks like this:

1. call `defineProfile` with `agent: { model, prompt }` and optional `capabilities`
2. pass the profile array into `createAgentApp({ dataDir, profiles: [...] })`

## Minimal Example

```ts
import { defineProfile } from "@agentrail/app";

export const supportProfile = defineProfile({
  id: "support",
  name: "Support Agent",
  agent: {
    model: "anthropic:claude-sonnet-4-5",
    prompt: `You are a customer support assistant.
Ask clarifying questions when the request is ambiguous.
Use tools only when needed.`,
    maxTurns: 20,
  },
});
```

Pass it to `createAgentApp` in your entry point:

```ts
import { createAgentApp } from "@agentrail/app";
import { supportProfile } from "./profiles/support.js";

const app = createAgentApp({
  dataDir: DATA_DIR,
  profiles: [supportProfile],
});
```

## The Real Repository Example

The playground example follows this pattern in:

- [examples/playground-server/src/profiles/default-profile.ts](https://github.com/yai-dev/agentrail/blob/main/examples/playground-server/src/profiles/default-profile.ts)

That profile:

- uses `defineProfile`
- builds its system prompt with the prompt SDK
- passes capability descriptors via the `capabilities` field
- is registered via `createAgentApp({ profiles: [...] })` in `main.ts`

This is a good template for application code because it keeps the profile file small and focused.

## Prompt Integration

Profiles can expose prompt behavior in two common ways:

- `agent.prompt`: a static string (simplest — recommended for small apps)
- `agent.prompt`: an async function `(ctx) => string` when rendering depends on variables or a cached builder

For larger apps, prefer the prompt SDK over raw string literals so that:

- prompt fragments can be named and overridden
- role/mode prompts stay composable
- system prompt structure does not leak into routes

See [Manage Prompts](manage-prompts.md) for the recommended layout.

## Dynamic Agent Construction

For full per-request control, use the `createAgent` factory:

```ts
import { defineAgent } from "@agentrail/core";
import { defineProfile } from "@agentrail/app";

export const supportProfile = defineProfile({
  id: "support",
  name: "Support Agent",
  async createAgent(ctx) {
    const system = await loadTenantPrompt(ctx.tenantId);
    return defineAgent({
      id: "support",
      model: { provider: "anthropic", modelId: "claude-sonnet-4-5" },
      system,
      maxTurns: 20,
    });
  },
});
```

Good profile construction code is usually:

- small
- deterministic
- free of HTTP concerns
- free of environment parsing

## Profile Registration

Pass profiles to `createAgentApp`:

```ts
const app = createAgentApp({
  dataDir: DATA_DIR,
  profiles: [supportProfile, researchProfile],
});
```

For custom routing (tenant-aware, feature-flag-aware, etc.), use `resolveProfile`:

```ts
import type { ProfileResolver } from "@agentrail/app";

const resolver: ProfileResolver = async ({ agentId, tenantId }) => {
  return await loadProfileForTenant(agentId, tenantId);
};

const app = createAgentApp({
  dataDir: DATA_DIR,
  resolveProfile: resolver,
  defaultAgentId: "support",
});
```

`ProfileResolver` is the formal contract for dynamic routing. Implement it when profile selection depends on request context (tenant, mode, feature flags). For a static list, pass `profiles` directly.

## Multi-Profile Applications

A single Agentrail host can expose multiple profiles.

Common reasons to do this:

- one support assistant and one research assistant
- a default chat profile and a more specialized workflow profile
- separate profiles for different tenants or product surfaces

Keep these profiles separate when they differ in:

- prompt behavior
- default tools
- orchestration strategy
- domain responsibilities

Do not create multiple profiles just to swap one string or one tiny config value.

## Common Mistakes

Avoid these profile anti-patterns:

- putting route logic into profile code
- reading environment variables directly inside `createAgent`
- embedding giant system prompts inline in the profile file
- duplicating the same profile with tiny differences instead of using prompt vars or tool options

## Next Steps

Once a profile is in place, the next most common follow-ups are:

1. add tools and capability builders
2. add context providers
3. add plugin behavior around the host lifecycle
4. add orchestration or workflow-specific modes

Continue with:

- [Add Tools](add-tools.md)
- [Add Context](add-context.md)
- [Manage Prompts](manage-prompts.md)
