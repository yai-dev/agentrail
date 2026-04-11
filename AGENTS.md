# Repository Guidelines

## Project Structure & Module Organization

This repository is a `pnpm` workspace. Core publishable packages live in `packages/*`, each with `src/`, `test/`, and usually `dist/`. End-to-end examples live in `examples/*`, including `examples/playground-server`, `examples/playground-ui`, and `examples/deep-research`. Documentation lives in `docs/`, shared local config in `config/agentrail.yaml`, static assets in `assets/`, and sandbox image sources in `docker/sandbox`.

## Build, Test, and Development Commands

Install once with `pnpm install` on Node.js 22.

- `pnpm build`: build all packages and examples.
- `pnpm test`: run package test suites recursively.
- `pnpm typecheck`: run TypeScript checks across packages and examples.
- `pnpm format` / `pnpm format:check`: apply or verify Prettier formatting.
- `pnpm dev:playground-server`, `pnpm dev:playground-ui`, `pnpm dev:deep-research`: run example apps locally.
- `pnpm --filter @agentrail/runtime-core test`: run a single package’s tests while iterating.
- `docker build -t agentrail-sandbox:latest docker/sandbox`: rebuild the sandbox image when touching sandbox code.

## Coding Style & Naming Conventions

The codebase is TypeScript ESM. Prettier is the formatting authority: 2-space indentation, semicolons, double quotes, trailing commas, and 100-column width. Imports are organized by `prettier-plugin-organize-imports`. Keep source under `src/` and name tests with `.test.ts` under `test/`. Use descriptive file names such as `agentLoop.test.ts` or `session-store.test.ts`; prefer `camelCase` for variables/functions and `PascalCase` for exported types and classes.

## Testing Guidelines

Vitest is the standard test runner. Package configs such as `packages/runtime-core/vitest.config.ts` use Node environments and V8 coverage reporting. Add or update tests alongside behavior changes, especially in published packages. Before opening a PR, run the smallest relevant scoped command first, then `pnpm test` and `pnpm typecheck` for full verification.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commits such as `fix: ...`, `chore: ...`, and `feat: ...`; keep subjects short and imperative. PRs should describe the behavioral change, list validation commands run, and link the related issue when applicable. Add a changeset with `pnpm changeset` for user-visible changes to published packages; docs-only and internal-only updates usually do not need one.

## Security & Configuration Tips

Keep secrets in environment variables like `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`, never in `config/agentrail.yaml`. If you change published sandbox behavior, update `@agentrail/sandbox` and rebuild the Docker image locally.
