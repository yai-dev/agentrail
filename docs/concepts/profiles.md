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

### Static Profile

The recommended starting point. Supply an `agent` configuration and optional `capabilities`:

```ts
import { defineProfile } from "@agentrail/app";

export const defaultProfile = defineProfile({
  id: "default",
  name: "Default Assistant",
  agent: {
    model: "anthropic:claude-sonnet-4-5",
    prompt: "You are a helpful assistant.",
    maxTurns: 30,
  },
  capabilities: [filesystem({ sandboxManager })],
});
```

`defineProfile` handles agent construction, capability wiring, and context provider injection automatically.

### Dynamic Profile

Use the `createAgent` factory when the agent configuration must vary per request (tenant-aware models, runtime feature flags, etc.):

```ts
import { defineAgent } from "@agentrail/core";
import { defineProfile } from "@agentrail/app";

export const tenantProfile = defineProfile({
  id: "tenant",
  name: "Tenant Assistant",
  async createAgent(ctx) {
    const system = await loadTenantPrompt(ctx.tenantId);
    return defineAgent({
      id: "tenant",
      model: { provider: "anthropic", modelId: "claude-sonnet-4-5" },
      system,
      maxTurns: 30,
    });
  },
  capabilities: [filesystem({ sandboxManager })],
  // Required when capabilities need model info (e.g. skills()):
  modelConfig: { provider: "anthropic", modelId: "claude-sonnet-4-5" },
});
```

## Key Fields

| Field          | Purpose                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `id`           | Stable identifier used by the host to resolve this profile              |
| `name`         | Human-readable label for logs and diagnostics                           |
| `agent`        | Static agent config (static shape only)                                 |
| `createAgent`  | Per-request factory function (dynamic shape only)                       |
| `capabilities` | Capability descriptors to compose into the agent                        |
| `modelConfig`  | Model metadata for capabilities that spawn sub-agents (e.g. `skills()`) |

The low-level `AgentrailProfile` contract also supports `contextWindow` for token-budget calculations, but `defineProfile` does not currently expose it as a first-class helper field. If you do not provide it through a lower-level custom profile, the host defaults to `200_000`.

## Profile Registration

Profiles are registered by passing them to `createAgentApp`:

```ts
import { createAgentApp } from "@agentrail/app";

const app = createAgentApp({
  dataDir: "./data",
  profiles: [defaultProfile, adminProfile, researchProfile],
});
```

`createAgentApp` builds a resolver internally. It looks up the profile by `agentId` from the request and falls back to the first profile if none is specified.

For more complex routing — tenant-based selection, mode-switching, feature flags — provide a custom `resolveProfile` function:

```ts
import { createAgentApp } from "@agentrail/app";
import type { ProfileResolver } from "@agentrail/app";

const resolveProfile: ProfileResolver = async ({ agentId, tenantId }) => {
  return await loadProfileForTenant(agentId, tenantId);
};

const app = createAgentApp({
  dataDir: "./data",
  resolveProfile,
  defaultAgentId: "default",
});
```

## Multi-Profile Apps

Most apps start with a single profile and add more over time. Each profile is independently deployable and testable. Common patterns:

- **One profile per agent role** — a chat assistant, a code reviewer, and a research workflow each have their own profile
- **Tenant-scoped profiles** — the resolver reads `tenantId` and returns the correct profile for that tenant
- **Feature-flagged profiles** — the resolver checks a feature flag and picks a new or legacy profile variant

## Profile vs Agent vs Plugin

These three concepts often get confused:

| Concern                                              | Belongs in                             |
| ---------------------------------------------------- | -------------------------------------- |
| Agent execution loop, model, tools                   | Agent (`defineAgent`)                  |
| How an agent is assembled for a request              | Profile (`defineProfile`)              |
| Cross-cutting host behavior (memory, slash commands) | Plugin (`AgentrailPlugin`)             |
| Prompt content and fragments                         | Prompt builder (`createPromptBuilder`) |

## Related Concepts

- [Agents](agents.md)
- [Host](host.md)
- [Prompts](prompts.md)
- [Plugins](plugins.md)

## Related Reference

- [Profile Contract Reference](../reference/profile-contract.md)
- [Build a Profile Guide](../guides/build-a-profile.md)
