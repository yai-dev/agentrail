# @agentrail/create-agentrail-app

Compatibility wrapper for creating a new Agentrail project with `npm create` or `pnpm dlx`. It delegates the actual scaffolding logic to `@agentrail/cli`.

## Installation

```bash
pnpm dlx @agentrail/create-agentrail-app my-app
```

## Quick example

```bash
pnpm dlx @agentrail/create-agentrail-app my-app
cd my-app
pnpm install
pnpm dev
```

## API

- `create-agentrail-app <name>` — scaffold a new project from the official template.
- Runtime API surface: none. This package exists as a CLI entry shim only.

Reference:
- `https://agentrail.run/guides/quickstart`

## Related packages

- `@agentrail/cli` — owns the actual project creation logic.
- `@agentrail/app` — the primary hosted package used by the generated app template.

## License

Apache-2.0
