# Profiles

A profile is the contract between the host layer and a runtime agent. It tells the host how to construct an agent for a specific request context.

## Why Profiles Exist

Without profiles, every route would need to know how to build an agent from scratch — wiring together model config, system prompts, tools, and context. Profiles extract that logic into a named, reusable unit.

A profile answers three questions:

1. **Identity** — what is this agent called and which `agentId` does it respond to?
2. **Construction** — how should the agent be built for this request (tenant, user, session)?
3. **Behavior** — what optional request-level overrides apply?

This keeps route files thin and makes agent assembly testable and reusable.

## The Two Profile Shapes

### Primitive profile — `AgentrailProfile`

The minimal contract required by the host. Defined in `@agentrail/host`:

```ts
interface AgentrailProfile {
  id: string;
  name: string;
  contextWindow?: number;
  createAgent(
    context: AgentrailRequestContext,
    onSubAgentEvent?: SubAgentEventHandler,
  ): Promise<Agent> | Agent;
  resolveProfile?(context: AgentrailRequestContext): Promise<AgentrailProfile | null>;
  transformContext?: TransformContextFn;
}
```

Use this shape when you need full control over the construction logic, or when integrating with an existing server that does not use the defaults layer.

### Hosted profile — `defineHostedProfile`

The recommended shape from `@agentrail/host/defaults`. It adds structure around the primitive contract:

```ts
import { defineHostedProfile } from "@agentrail/host/defaults";
import { defineAgent } from "@agentrail/runtime-core";

export const defaultProfile = defineHostedProfile({
  id: "default",
  name: "Default Assistant",
  prompt: myPromptBundle,
  createAgent: ({ tools, systemPrompt }) =>
    defineAgent({
      id: "default",
      model: {
        provider: "anthropic",
        modelId: "claude-sonnet-4-5",
        apiKey: process.env.ANTHROPIC_API_KEY,
      },
      system: systemPrompt,
      tools,
    }),
});
```

The `createAgent` function in the hosted shape receives a pre-assembled context object with `tools` (built from the capability layer) and `systemPrompt` (rendered from the prompt bundle). You extend or override either as needed.

## Key Fields

| Field              | Purpose                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `id`               | Stable identifier used by the host to resolve this profile                                |
| `name`             | Human-readable label for logs and diagnostics                                             |
| `contextWindow`    | LLM context window size in tokens (used for token budget calculations, default `200_000`) |
| `prompt`           | A prompt bundle or builder providing the system prompt                                    |
| `createAgent`      | Factory function that constructs the agent for a given request                            |
| `transformContext` | Optional function to inject extra request-time context messages                           |
| `orchestration`    | Optional orchestration binding for multi-agent workflows                                  |

## Profile Resolver

The host does not hold profiles directly. It holds a **resolver** — a function that takes a request context and returns the right profile.

The simplest resolver is built with `createHostedProfileResolver` (defaults layer):

```ts
import { createHostedProfileResolver } from "@agentrail/host/defaults";

const resolveProfile = createHostedProfileResolver([defaultProfile, adminProfile, researchProfile]);
```

The resolver looks up the profile by `agentId` from the request. If no matching profile is found, it falls back to the `defaultAgentId` configured on the route.

For more complex routing — such as tenant-based profile selection or mode-switching — you can wrap `createProfileResolver` from `@agentrail/host` with your own logic.

## Multi-Profile Apps

Most apps start with a single profile and add more over time. Each profile is independently deployable and testable. Common patterns:

- **One profile per agent role** — a chat assistant, a code reviewer, and a research workflow each have their own profile
- **Tenant-scoped profiles** — the resolver reads `tenantId` and returns the correct profile for that tenant
- **Feature-flagged profiles** — the resolver checks a feature flag and picks a new or legacy profile variant

## Profile vs Agent vs Plugin

These three concepts often get confused:

| Concern                                              | Belongs in                      |
| ---------------------------------------------------- | ------------------------------- |
| Agent execution loop, model, tools                   | Agent (`defineAgent`)           |
| How an agent is assembled for a request              | Profile (`defineHostedProfile`) |
| Cross-cutting host behavior (memory, slash commands) | Plugin (`AgentrailPlugin`)      |
| Prompt content and fragments                         | Prompt bundle                   |

## Related Concepts

- [Agents](agents.md)
- [Host](host.md)
- [Prompts](prompts.md)
- [Plugins](plugins.md)

## Related Reference

- [Profile Contract Reference](../reference/profile-contract.md)
- [Host Defaults Reference](../reference/host-defaults.md)
- [Build a Profile Guide](../guides/build-a-profile.md)
