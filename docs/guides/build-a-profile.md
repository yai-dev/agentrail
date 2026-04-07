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
- the system prompt (static string or dynamic builder)
- optional tools and capabilities
- optional request-specific behavior for chat or workflow modes

A profile should usually **not** own:

- route mounting
- session storage
- sandbox lifecycle
- plugin startup/shutdown
- unrelated background jobs

Those belong to the host layer.

## Recommended Flow

The usual path looks like this:

1. define a prompt bundle or prompt builder
2. call `defineProfile` with `model`, `system`, and optional `tools`/`capabilities`
3. pass the profile array into `createAgentApp({ profiles: [...] })`

## Minimal Example

```ts
import { defineProfile } from "@agentrail/app";

export const supportProfile = defineProfile({
  id: "support",
  name: "Support Agent",
  model: "anthropic/claude-sonnet-4-5",
  system: `You are a customer support assistant.
Ask clarifying questions when the request is ambiguous.
Use tools only when needed.`,
  maxTurns: 20,
});
```

Pass it to `createAgentApp` in your entry point:

```ts
import { createAgentApp, SessionManager } from "@agentrail/app";
import { supportProfile } from "./profiles/support.js";

const { app } = createAgentApp({
  profiles: [supportProfile],
  sessionManager: new SessionManager(DATA_DIR),
});
```

## The Real Repository Example

The playground example follows this pattern in:

- [examples/playground-server/src/profiles/default-profile.ts](../../examples/playground-server/src/profiles/default-profile.ts)

That profile:

- uses `defineProfile`
- builds its system prompt with the prompt SDK
- passes capability descriptors via the `capabilities` field
- is registered via `createAgentApp({ profiles: [...] })` in `main.ts`

This is a good template for application code because it keeps the profile file small and focused.

## Prompt Integration

Profiles can expose prompt behavior in two common ways:

- `system`: a static string (simplest — recommended for small apps)
- `promptBuilder`: an async function when rendering depends on variables, layers, or a cached builder (advanced)

For larger apps, prefer the prompt SDK over raw string literals so that:

- prompt fragments can be named and overridden
- role/mode prompts stay composable
- system prompt structure does not leak into routes

See [Manage Prompts](manage-prompts.md) for the recommended layout.

## Agent Construction

`defineProfile` uses a static agent configuration by default. For advanced use cases you can supply a `createAgent` factory:

```ts
import { defineAgent } from "@agentrail/core";
import { defineProfile } from "@agentrail/app";

export const supportProfile = defineProfile({
  id: "support",
  name: "Support Agent",
  createAgent: async () =>
    defineAgent({
      id: "support",
      model: { provider: "anthropic", modelId: "claude-sonnet-4-5" },
      system: "You are a customer support assistant.",
      maxTurns: 20,
    }),
});
```

Good profile construction code is usually:

- small
- deterministic
- free of HTTP concerns
- free of environment parsing

If `createAgent` starts reading request bodies, parsing routes, or booting unrelated services, that logic probably belongs elsewhere.

## Profile Registration

Pass profiles to `createAgentApp`:

```ts
const { app } = createAgentApp({
  profiles: [supportProfile, researchProfile],
  sessionManager,
});
```

Profile selection is based on profile id from the request. If your selection rules depend on request mode, tenant-specific policies, or feature flags, you can use `defineHostedProfile` with a custom `createHostedProfileResolver` (lower-level escape hatch in `@agentrail/app`).

## Multi-Profile Applications

A single Agentrail host can expose multiple hosted profiles.

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
