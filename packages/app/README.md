# @agentrail/app

Hosted app layer for Agentrail: profiles, sessions, plugins, config, and `createAgentApp`. It does not define the core agent runtime itself.

## Installation

```bash
pnpm add @agentrail/app @agentrail/core
```

## Quick example

```ts
import "@agentrail/core/providers";
import { createAgentApp, defineProfile } from "@agentrail/app";
import { defineAgent, type Message } from "@agentrail/core";

const profile = defineProfile({
  id: "assistant",
  name: "Assistant",
  createAgent: () =>
    defineAgent({
      name: "assistant",
      systemPrompt: "You are a helpful assistant.",
      model: {
        provider: "openai",
        modelId: "gpt-4.1-mini",
      },
    }),
});

const summarize = async (messages: Message[]) =>
  messages.map((m) => `${m.role}: ${JSON.stringify(m.content)}`).join("\n");

const app = createAgentApp({
  dataDir: "./.agentrail",
  profiles: [profile],
  summarize,
});

export default app;
```

## API

- `createAgentApp(options)` — create a Hono app with hosted `/chat` and `/stream` routes.
- `defineProfile(definition)` — define a static or dynamic hosted profile.
- `SessionManager` — filesystem-backed `AgentrailSessionStore` implementation.
- `createStaticProfileResolver(profiles)` — create a fixed profile resolver.
- `createUserMemoryPlugin()` — built-in plugin for user memory consolidation.
- `loadAgentrailConfig()` — load and validate `agentrail.yaml`.

Reference:

- `https://agentrail.run/reference/create-agent-app`
- `https://agentrail.run/reference/profile-contract`
- `https://agentrail.run/reference/host-primitives`

## Related packages

- `@agentrail/core` — runtime primitives used inside profiles and tools.
- `@agentrail/capabilities` — reusable capability descriptors for filesystem, browser, orchestration, and more.

## License

Apache-2.0
