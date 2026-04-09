# @agentrail/capabilities

Reusable capability descriptors and advanced managers for Agentrail apps. It extends the agent surface area, but does not own HTTP routing or session persistence.

## Installation

```bash
pnpm add @agentrail/capabilities @agentrail/app @agentrail/core
```

## Quick example

```ts
import "@agentrail/core/providers";
import { defineProfile } from "@agentrail/app";
import { filesystem } from "@agentrail/capabilities";
import { defineAgent } from "@agentrail/core";

export const codingProfile = defineProfile({
  id: "coder",
  name: "Coder",
  capabilities: [filesystem()],
  createAgent: () =>
    defineAgent({
      name: "coder",
      systemPrompt: "You are a coding assistant with sandboxed filesystem tools.",
      model: {
        provider: "anthropic",
        modelId: "claude-sonnet-4-5",
      },
    }),
});
```

## API

- `filesystem(options?)` — sandboxed execution tools such as bash, read, write, edit, glob, grep, sleep, and todo.
- `browser(options?)` — browser automation capability.
- `knowledge()` — knowledge-base tools and metadata context.
- `skills(options?)` — skill discovery and execution capability.
- `orchestration(options?)` — sub-agent orchestration tools.
- `memoryContext(options)` — capability that injects memory, identity, knowledge, and workspace context.
- `SandboxManager`, `KnowledgeManager`, `SkillManager`, `OrchestrationManager` — advanced managers for direct integration.

Reference:
- `https://agentrail.run/guides/use-capability-packages`
- `https://agentrail.run/reference/host-defaults`

## Related packages

- `@agentrail/app` — mounts capabilities into hosted profiles and routes.
- `@agentrail/core` — defines the runtime tool and agent contracts that capabilities build on.

## License

Apache-2.0
