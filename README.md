# Agentrail

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

## Recommended Path

Start with the opinionated SDK, then drop down to lower-level primitives only when you need tighter control.

1. Read the core concepts:
   - [Agents](docs/concepts/agents.md)
   - [Host](docs/concepts/host.md)
   - [Profiles](docs/concepts/profiles.md)
   - [Prompts](docs/concepts/prompts.md)
2. Follow the first-use guide:
   - [Quickstart](docs/guides/quickstart.md)
3. Explore the reference docs when you need more control:
   - [Host Defaults](docs/reference/host-defaults.md)
   - [Host Primitives](docs/reference/host-primitives.md)
   - [Prompt SDK](docs/reference/prompt-sdk.md)

## Reading Paths

### New To Agentrail

Use this path if you want to get from zero to a working hosted app as quickly as possible:

1. [What is Agentrail?](#agentrail)
2. [Quickstart](docs/guides/quickstart.md)
3. [Build a Profile](docs/guides/build-a-profile.md)
4. [Manage Prompts](docs/guides/manage-prompts.md)
5. [Add Tools](docs/guides/add-tools.md)
6. [Add Context](docs/guides/add-context.md)
7. [Playground Server Example](docs/examples/playground-server.md)

### Going Deeper

Use this path if you want to understand the framework internals and extension boundaries:

1. [Architecture Overview](docs/architecture/README.md)
2. [Host Defaults Reference](docs/reference/host-defaults.md)
3. [Host Primitives Reference](docs/reference/host-primitives.md)
4. [Profile Contract Reference](docs/reference/profile-contract.md)
5. [Plugin Contract Reference](docs/reference/plugin-contract.md)
6. [Events Reference](docs/reference/events.md)
7. [Deep Research Example](docs/examples/deep-research.md)

## Quick Start For This Repository

If you want to run the included examples first instead of building a host from scratch:

1. Install dependencies:

```bash
pnpm install
```

1. Review and update the local YAML config:

```bash
sed -n '1,240p' config/agentrail.yaml
```

1. Set these non-sensitive fields in `config/agentrail.yaml`:

- `llm.provider`
- `llm.modelId`
- `search.provider`
- `auth.uiSecretToken` if you want the UI to require an access token

1. Set secrets via environment variables (do not store secrets in YAML):

- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
- `TAVILY_API_KEY` if you want deep-research search support

1. Start the example apps:

```bash
pnpm dev:playground-server
pnpm dev:playground-ui
```

1. Open the UI and start with the default playground flow.  
   If you only want the workflow example, use:

```bash
pnpm dev:deep-research
```

## Local Configuration

Agentrail examples load local development configuration from:

```text
config/agentrail.yaml
```

The YAML file is the shared template for this repository and future Agentrail app scaffolds. It includes comments for every supported field, along with each field's purpose and default value.

If you need a different local sandbox image, update:

```yaml
sandbox:
  image: agentrail-sandbox:latest
```

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

## Docs

- [Architecture Overview](docs/architecture/README.md)
- [Concepts](docs/concepts/agents.md)
- [Guides](docs/guides/quickstart.md)
- [Reference](docs/reference/host-defaults.md)
- [Examples](docs/examples/playground-server.md)
- [Troubleshooting](docs/guides/troubleshooting.md)
- [Deployment](docs/guides/deployment.md)
- [Roadmap](ROADMAP.md)

Recommended concept-first order:

1. [Agents](docs/concepts/agents.md)
2. [Host](docs/concepts/host.md)
3. [Profiles](docs/concepts/profiles.md)
4. [Plugins](docs/concepts/plugins.md)
5. [Prompts](docs/concepts/prompts.md)
6. [Events and Orchestration](docs/concepts/events-and-orchestration.md)

## Examples

- [`examples/playground-server`](docs/examples/playground-server.md): full hosted reference server
- [`examples/playground-ui`](docs/examples/playground-ui.md): companion UI for the playground server
- [`examples/deep-research`](docs/examples/deep-research.md): dedicated workflow example built on top of Agentrail

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
