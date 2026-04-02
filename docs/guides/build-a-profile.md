# Build a Profile

Use a hosted profile when you want the host layer to manage agent construction for each request.

## Prerequisites

Read this guide after:

- [Quickstart](quickstart.md)
- [Profiles](../concepts/profiles.md)
- [Prompt SDK Reference](../reference/prompt-sdk.md)

A profile is the main boundary between:

- framework-level host/runtime code
- application-specific agent behavior

If you are building on Agentrail, the profile is usually where your app starts to become unique.

## What A Hosted Profile Owns

A hosted profile should define:

- the profile id and display name
- how the prompt is assembled
- how the agent instance is created
- optional request-specific behavior for chat or workflow modes

A hosted profile should usually **not** own:

- route mounting
- session storage
- sandbox lifecycle
- plugin startup/shutdown
- unrelated background jobs

Those belong to the host layer.

## Recommended Flow

The usual path looks like this:

1. define a prompt bundle or prompt builder
2. implement `createAgent`
3. wrap the result with `defineHostedProfile`
4. register the profile with `createHostedProfileResolver`
5. pass the resolver into chat and stream routes

## Minimal Example

```ts
import { defineAgent } from "@agentrail/runtime-core";
import { defineHostedProfile, createHostedProfileResolver } from "@agentrail/host/defaults";

export const supportProfile = defineHostedProfile({
  id: "support",
  name: "Support Agent",
  createAgent: async () =>
    defineAgent({
      id: "support",
      model: {
        provider: "anthropic",
        modelId: "claude-sonnet-4-5",
        apiKey: process.env.ANTHROPIC_API_KEY,
      },
      system: `You are a customer support assistant.
Ask clarifying questions when the request is ambiguous.
Use tools only when needed.`,
      tools: [],
      maxTurns: 20,
    }),
});

export const resolveProfile = createHostedProfileResolver([supportProfile]);
```

## The Real Repository Example

The playground example follows this pattern in:

- [examples/playground-server/src/profiles/default-profile.ts](../../examples/playground-server/src/profiles/default-profile.ts)

That profile:

- uses `defineHostedProfile`
- builds its prompt with the prompt SDK
- delegates agent construction to the playground agent registry
- exports a resolver built with `createHostedProfileResolver`

This is a good template for application code because it keeps the profile file small and focused.

## Prompt Integration

Profiles can expose prompt behavior in two common ways:

- `prompt`: when the prompt is already assembled or trivial to render
- `promptBuilder`: when rendering depends on variables, layers, or a cached builder

For larger apps, prefer the prompt SDK over raw string literals so that:

- prompt fragments can be named and overridden
- role/mode prompts stay composable
- system prompt structure does not leak into routes

See [Manage Prompts](manage-prompts.md) for the recommended layout.

## Agent Construction

`createAgent` is where you choose how much of the framework you want to use.

Typical options:

- create a single-agent runtime with `defineAgent`
- delegate to an app-specific registry that selects one implementation
- wrap a workflow package that internally orchestrates sub-agents

Good profile construction code is usually:

- small
- deterministic
- free of HTTP concerns
- free of environment parsing

If `createAgent` starts reading request bodies, parsing routes, or booting unrelated services, that logic probably belongs elsewhere.

## Profile Resolution

`createHostedProfileResolver` is the recommended path when:

- you have one or more profiles
- profile selection is based on profile id
- you do not need app-specific resolution rules

If your selection rules depend on request mode, tenant-specific policies, or feature flags, you can still start with the hosted resolver and wrap it with your own logic before handing it to `createChatRoute` or `createStreamRoute`.

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
