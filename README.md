<p align="center">
  <img src="assets/logo.svg#gh-light-mode-only" alt="Agentrail" height="52" />
  <img src="assets/logo-dark.svg#gh-dark-mode-only" alt="Agentrail" height="52" />
</p>

<p align="center">
  Build, host, and orchestrate tool-using AI agents.
</p>

<p align="center">
  <a href="https://github.com/yai-dev/agentrail"><img src="https://img.shields.io/badge/status-pre--GA-orange" alt="Pre-GA" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License" /></a>
  <a href="https://github.com/yai-dev/agentrail"><img src="https://img.shields.io/github/stars/yai-dev/agentrail?style=flat" alt="Stars" /></a>
  <a href="https://github.com/yai-dev/agentrail/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome" /></a>
</p>

<p align="center">
  <strong>Website & Docs → <a href="https://agentrail.run">agentrail.run</a></strong>
</p>

---

Agentrail is an open-source agent harness framework for building, hosting, and orchestrating tool-using AI agents.

It provides a composable runtime core, a hosted server layer, a prompt SDK, multi-agent orchestration, filesystem-backed memory, sandboxed execution, and optional plugins and workflows.

> [!NOTE]
> Agentrail is in pre-GA development. Public APIs and package boundaries may change before the first stable release. See [ROADMAP.md](ROADMAP.md) for current status and planned milestones.

## Why Agentrail

Agentrail grew out of patterns developed in a production AI agent system, distilled into a composable open-source framework.

It is designed for developers who want more structure than ad hoc agent scripts, but less product lock-in than a hosted platform.

- **Production-proven** — built from real-world agent infrastructure, not a proof-of-concept
- **Code-first, no platform lock-in** — define everything in code, no hosted platform or GUI required
- **Complete host layer** — goes beyond an agent loop with a full chat and streaming request lifecycle
- **Pluggable LLM providers** — unified abstraction over Anthropic, OpenAI, and others; swap without rewriting agent logic
- **Multi-agent orchestration** — delegate work to sub-agents with mailboxing, structured waits, and failure recovery
- **Profile and plugin extension model** — package agent behavior in profiles, extend the runtime through plugins with clear boundaries
- **Session memory and knowledge** — built-in message history compaction, knowledge-base indexing, and retrieval
- **Docker sandbox isolation** — run LLM-generated code safely, fully isolated from the host environment

## Package Map

- [![npm](https://img.shields.io/npm/v/@agentrail/runtime-core)](https://www.npmjs.com/package/@agentrail/runtime-core) `@agentrail/runtime-core`: agent definition, execution loop, tool contracts, provider abstractions
- [![npm](https://img.shields.io/npm/v/@agentrail/host)](https://www.npmjs.com/package/@agentrail/host) `@agentrail/host`: hosted request primitives for chat and stream lifecycles
- [![npm](https://img.shields.io/npm/v/@agentrail/host)](https://www.npmjs.com/package/@agentrail/host) `@agentrail/host/defaults`: recommended hosted SDK and default capability builders
- [![npm](https://img.shields.io/npm/v/@agentrail/prompts)](https://www.npmjs.com/package/@agentrail/prompts) `@agentrail/prompts`: prompt fragments, bundles, rendering, and file loading
- [![npm](https://img.shields.io/npm/v/@agentrail/orchestration)](https://www.npmjs.com/package/@agentrail/orchestration) `@agentrail/orchestration`: managed sub-agents, mailboxing, waits, and recovery
- [![npm](https://img.shields.io/npm/v/@agentrail/memo)](https://www.npmjs.com/package/@agentrail/memo) `@agentrail/memo`: session storage, message history, and compaction
- [![npm](https://img.shields.io/npm/v/@agentrail/knowledge)](https://www.npmjs.com/package/@agentrail/knowledge) `@agentrail/knowledge`: knowledge-base indexing and reading tools
- [![npm](https://img.shields.io/npm/v/@agentrail/skills)](https://www.npmjs.com/package/@agentrail/skills) `@agentrail/skills`: skill discovery and skill tool execution
- [![npm](https://img.shields.io/npm/v/@agentrail/sandbox)](https://www.npmjs.com/package/@agentrail/sandbox) `@agentrail/sandbox`: sandbox lifecycle and execution/browser tools
- [![npm](https://img.shields.io/npm/v/@agentrail/tools)](https://www.npmjs.com/package/@agentrail/tools) `@agentrail/tools`: general-purpose tools such as ask-user and todo writing
- [![npm](https://img.shields.io/npm/v/@agentrail/events)](https://www.npmjs.com/package/@agentrail/events) `@agentrail/events`: shared event contracts
- [![npm](https://img.shields.io/npm/v/@agentrail/config)](https://www.npmjs.com/package/@agentrail/config) `@agentrail/config`: typed YAML config loading, defaults, and validation for Agentrail apps
- [![npm](https://img.shields.io/npm/v/@agentrail/plugin-user-memory)](https://www.npmjs.com/package/@agentrail/plugin-user-memory) `@agentrail/plugin-user-memory`: plugin for persistent user memory across sessions
- [![npm](https://img.shields.io/npm/v/@agentrail/slash-commands)](https://www.npmjs.com/package/@agentrail/slash-commands) `@agentrail/slash-commands`: slash command parsing and dispatch
- [![npm](https://img.shields.io/npm/v/@agentrail/deep-research)](https://www.npmjs.com/package/@agentrail/deep-research) `@agentrail/deep-research`: deep research workflow built on top of Agentrail
- [![npm](https://img.shields.io/npm/v/@agentrail/create-agentrail-app)](https://www.npmjs.com/package/@agentrail/create-agentrail-app) `@agentrail/create-agentrail-app`: scaffolding CLI for new Agentrail projects

## Examples

- `examples/playground-server`: full hosted reference server
- `examples/playground-ui`: companion UI for the playground server
- `examples/deep-research`: dedicated workflow example built on top of Agentrail

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev:playground-server
pnpm dev:playground-ui
pnpm dev:deep-research
```

For contributor workflow details, see [CONTRIBUTING.md](CONTRIBUTING.md).

Useful verification commands while working on the framework:

```bash
pnpm --filter @agentrail/host test
pnpm --filter @agentrail/prompts test
pnpm --filter @agentrail/playground-server typecheck
```

## Quick Start

The fastest way to get started is the [Quickstart guide](https://agentrail.run/guides/quickstart) on the documentation site.

For a full local reference setup, see the `examples/playground-server` and `examples/playground-ui` packages.

## Community

- [GitHub Discussions](https://github.com/yai-dev/agentrail/discussions) — questions, ideas, and show and tell
- [Bug reports](https://github.com/yai-dev/agentrail/issues/new?template=bug_report.md) — use the issue tracker for confirmed bugs
- [Feature requests](https://github.com/yai-dev/agentrail/issues/new?template=feature_request.md)
- [Security vulnerabilities](SECURITY.md) — please do not open public issues

## License

Agentrail is licensed under [Apache-2.0](LICENSE).
