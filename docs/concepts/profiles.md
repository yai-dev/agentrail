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

### Recommended — `defineProfile`

The primary way to define profiles. Import from `@agentrail/app`:

```ts
import { defineProfile } from "@agentrail/app";

export const defaultProfile = defineProfile({
  id: "default",
  name: "Default Assistant",
  model: "anthropic/claude-sonnet-4-5",
  system: "You are a helpful assistant.",
  tools: [myTool],
  capabilities: [filesystem(sandboxManager)],
});
```

`defineProfile` handles agent construction, prompt assembly, and capability wiring automatically. This is the right starting point for most apps.

### Advanced — `defineHostedProfile`

The lower-level primitive from `@agentrail/app`. Use it when you need fine-grained control over construction logic, for example when integrating with an existing agent registry:

```ts
import { defineHostedProfile } from "@agentrail/app";
import { defineAgent } from "@agentrail/core";

export const defaultProfile = defineHostedProfile({
  id: "default",
  name: "Default Assistant",
  prompt: myPromptBundle,
  createAgent: ({ tools, systemPrompt }) =>
    defineAgent({
      id: "default",
      model: "anthropic/claude-sonnet-4-5",
      system: systemPrompt,
      tools,
    }),
});
```

`defineHostedProfile` receives a pre-assembled context object with `tools` (built from the capability layer) and `systemPrompt` (rendered from the prompt bundle).

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

## Profile Registration

Profiles are registered by passing them to `createAgentApp`:

```ts
import { createAgentApp, SessionManager } from "@agentrail/app";

const { app } = createAgentApp({
  profiles: [defaultProfile, adminProfile, researchProfile],
  sessionManager: new SessionManager(DATA_DIR),
});
```

`createAgentApp` builds a resolver internally. It looks up the profile by `agentId` from the request and falls back to the `defaultAgentId` if none is specified.

For more complex routing — such as tenant-based profile selection or mode-switching — use `createHostedProfileResolver` from `@agentrail/app` directly and pass it to `createChatRoute` / `createStreamRoute`.

## Multi-Profile Apps

Most apps start with a single profile and add more over time. Each profile is independently deployable and testable. Common patterns:

- **One profile per agent role** — a chat assistant, a code reviewer, and a research workflow each have their own profile
- **Tenant-scoped profiles** — the resolver reads `tenantId` and returns the correct profile for that tenant
- **Feature-flagged profiles** — the resolver checks a feature flag and picks a new or legacy profile variant

## Profile vs Agent vs Plugin

These three concepts often get confused:

| Concern                                              | Belongs in                                  |
| ---------------------------------------------------- | ------------------------------------------- |
| Agent execution loop, model, tools                   | Agent (`defineAgent`)                       |
| How an agent is assembled for a request              | Profile (`defineProfile`)                   |
| Cross-cutting host behavior (memory, slash commands) | Plugin (`AgentrailPlugin`)                  |
| Prompt content and fragments                         | Prompt bundle (`definePromptBundle`)        |

## Related Concepts

- [Agents](agents.md)
- [Host](host.md)
- [Prompts](prompts.md)
- [Plugins](plugins.md)

## Related Reference

- [Profile Contract Reference](../reference/profile-contract.md)
- [Build a Profile Guide](../guides/build-a-profile.md)
