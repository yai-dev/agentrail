---
"@agentrail/capabilities": minor
"@agentrail/app": minor
"@agentrail/deep-research": minor
---

**Add Exa AI-powered search provider**

New `createExaSearchProvider` adapter in `@agentrail/capabilities` exposes [Exa](https://exa.ai) as a `WebSearchProvider` alongside Tavily, Brave, and Jina. Exa's AI-powered search returns high-quality results with content snippets (highlights, summaries, or full text) that are normalized into the standard `WebSearchResult` shape.

### New public exports (`@agentrail/capabilities`)

- `createExaSearchProvider({ apiKey, ... })` — factory for the Exa adapter
- `ExaSearchProviderOptions` — includes `searchType`, `category`, `includeDomains`, `excludeDomains`, `includeText`, `excludeText`, `startPublishedDate`, `endPublishedDate`, `userLocation`, `timeoutMs`

### Config (`@agentrail/app`)

- `AgentrailConfig.search` gains an `exaApiKey` field (defaults to `""`)
- `SharedResolvedAppConfig` exposes the resolved `exaApiKey` alongside the existing provider keys

### Deep research (`@agentrail/deep-research`)

- `DeepResearchRuntimeConfig` gains an optional `exaApiKey` field
- Setting `search.provider: exa` + `search.exaApiKey` (or the `EXA_API_KEY` env var) now selects Exa as the search backend for the deep-research workflow

All outbound requests set `x-exa-integration: agentrail` so usage can be attributed to this integration by the Exa team.
