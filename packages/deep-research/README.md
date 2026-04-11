# @agentrail/deep-research

Reusable Deep Research workflow package for Agentrail. It provides a multi-agent research coordinator and routes, but does not replace the general hosted app layer.

## Installation

```bash
pnpm add @agentrail/deep-research @agentrail/app @agentrail/core
```

## Quick example

```ts
import { SessionManager } from "@agentrail/app";
import { createDeepResearchRunRoute } from "@agentrail/deep-research";

const sessionStore = new SessionManager("./.agentrail");

const route = createDeepResearchRunRoute({
  sessionStore,
  runtime: {
    dataDir: "./.agentrail",
    model: {
      provider: "openai",
      modelId: "gpt-4.1-mini",
    },
    searchProvider: "tavily",
    tavilyApiKey: process.env.TAVILY_API_KEY,
  },
});
```

## API

- `createDeepResearchRunRoute(options)` — mount a blocking deep-research run endpoint.
- `createDeepResearchRoute(options)` — read deep-research state and artifacts.
- `runDeepResearchBlocking(input)` / `runDeepResearchStreaming(input)` — run the workflow programmatically.
- `DeepResearchCoordinator` — lower-level workflow coordinator.
- `createFileSystemDeepResearchStore(dataDir, sessionRef)` — persisted state/event store for deep-research runs.

Reference:

- `https://agentrail.run/examples/deep-research`

## Related packages

- `@agentrail/app` — provides session storage and hosted routes used around the workflow.
- `@agentrail/capabilities` — provides orchestration, sandbox, and web tools consumed by the workflow.

## License

Apache-2.0
