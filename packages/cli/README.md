# @agentrail/cli

Official Agentrail CLI for scaffolding projects, validating config, and diagnosing local environments. It is a developer tool, not a runtime framework package.

## Installation

```bash
pnpm add -D @agentrail/cli
```

## Quick example

```bash
pnpm agentrail create my-agentrail-app
pnpm agentrail doctor --check-sandbox
pnpm agentrail config validate --format json
```

## API

- `agentrail create [name]` — scaffold a new Agentrail project.
- `agentrail doctor` — check config, env vars, worker path, and sandbox readiness.
- `agentrail config validate` — validate config in CI-friendly mode.
- `runCreate(args)` — programmatic entrypoint used by `@agentrail/create-agentrail-app`.

Reference:

- `https://agentrail.run/guides/quickstart`
- `https://agentrail.run/guides/deployment`

## Related packages

- `@agentrail/create-agentrail-app` — thin package wrapper for `npm create` / `pnpm dlx` flows.
- `@agentrail/app` — hosted server package used by scaffolded projects.

## License

Apache-2.0
