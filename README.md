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

Agentrail is designed for developers who want more structure than ad hoc agent scripts, but less product lock-in than a hosted platform.

It gives you:

- A stable runtime core for defining and invoking agents
- A host layer for chat and stream request handling
- A recommended SDK for hosted profiles, default capability builders, and prompt composition
- Multi-agent orchestration for delegated work
- A clear extension model for plugins, prompts, context providers, and workflows

## Package Map

- `@agentrail/config`: typed YAML config loading, defaults, and validation for Agentrail apps
- `@agentrail/runtime-core`: agent definition, execution loop, tool contracts, provider abstractions
- `@agentrail/host`: hosted request primitives for chat and stream lifecycles
- `@agentrail/host/defaults`: recommended hosted SDK and default capability builders
- `@agentrail/prompts`: prompt fragments, bundles, rendering, and file loading
- `@agentrail/orchestration`: managed sub-agents, mailboxing, waits, and recovery
- `@agentrail/memo`: session storage, message history, and compaction
- `@agentrail/knowledge`: knowledge-base indexing and reading tools
- `@agentrail/skills`: skill discovery and skill tool execution
- `@agentrail/sandbox`: sandbox lifecycle and execution/browser tools
- `@agentrail/tools`: general-purpose tools such as ask-user and todo writing
- `@agentrail/events`: shared event contracts

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

For contributor workflow details, see [CONTRIBUTE.md](CONTRIBUTE.md).

Useful verification commands while working on the framework:

```bash
pnpm --filter @agentrail/host test
pnpm --filter @agentrail/prompts test
pnpm --filter @agentrail/playground-server typecheck
```

## License

Agentrail is licensed under [Apache-2.0](LICENSE).
