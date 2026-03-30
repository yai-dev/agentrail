# Deep Research Example

`@agentrail/deep-research-example` is a focused example app that shows how to build a research-oriented multi-agent workflow on top of Agentrail.

It extracts the Deep Research flow out of the playground app into a dedicated example package with:

- a blocking `POST /api/deep-research/run` endpoint
- persisted run state and event logs
- artifact download endpoints
- managed sub-agents for planner, researcher, analyst, and coder roles

## Run

```bash
pnpm --filter @agentrail/deep-research-example dev
```

The server reads its runtime settings from the shared repository config file:

- `config/agentrail.yaml`

The most important fields for this example are:

- `llm.provider`
- `llm.modelId`
- `llm.apiKey`
- `llm.baseUrl`
- `search.provider`
- `search.tavilyApiKey`
- `paths.dataDir`
- `auth.uiSecretToken`
- `apps.deepResearch.port`

## Endpoints

- `POST /api/deep-research/run`
- `GET /api/sessions/:sessionId/deep-research`
- `GET /api/sessions/:sessionId/deep-research/artifact`
- `GET /health`
