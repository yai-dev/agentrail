# Contributing To Agentrail

This document describes the expected development, configuration, and release flow for this repository.

## Prerequisites

- Node.js 22
- pnpm, managed through the root `packageManager` field
- Docker, if you touch `docker/sandbox` or `@agentrail/sandbox`

Install dependencies once before you start:

```bash
pnpm install
```

## Local Configuration

Agentrail examples read local app configuration from:

```text
config/agentrail.yaml
```

This file controls non-sensitive runtime settings such as:

- LLM provider name and model ID
- sandbox image and idle timeout
- orchestration sub-agent worker settings
- example app ports and feature toggles
- filesystem paths

**Secrets (API keys, auth tokens) should be set via environment variables, not in the YAML file.** The config loader respects these environment variables:

| Variable            | Purpose                       |
| ------------------- | ----------------------------- |
| `ANTHROPIC_API_KEY` | Anthropic LLM provider key    |
| `OPENAI_API_KEY`    | OpenAI LLM provider key       |
| `TAVILY_API_KEY`    | Tavily search integration key |
| `EXA_API_KEY`       | Exa search integration key    |

Store secrets in environment variables only. Do not add real credentials to `config/agentrail.yaml`.

## Developer Certificate of Origin (DCO)

All commits must be signed off to certify that you have the right to submit the contribution under this project's license (see [`DCO`](./DCO)).

Sign off every commit with `-s` / `--signoff`:

```bash
git commit -s -m "feat: my change"
```

This appends a `Signed-off-by: Your Name <email@example.com>` line to the commit message using your Git `user.name` and `user.email`. The DCO check runs automatically on every PR and will block merging if any commit is missing the sign-off.

If you forgot to sign off on previous commits, amend or rebase them:

```bash
# Single commit
git commit --amend --signoff

# Multiple commits (last N)
git rebase HEAD~N --signoff
```

## Daily Development Flow

1. Create a feature branch from `master`.
2. Update `config/agentrail.yaml` if you need different local runtime settings.
3. Make your code changes.
4. Run the local checks relevant to your changes.
5. Add a changeset if your change affects any published package.
6. Open a pull request (all commits must be signed off — see DCO section above).
7. After merge, let the release workflow create or update the Release PR.
8. Merge the Release PR to publish packages and, when applicable, the sandbox image.

## Local Verification

Run these before opening a PR when you touch framework packages:

```bash
pnpm format
pnpm build:packages
pnpm test
pnpm typecheck
```

If you change the sandbox package or Docker image, also run:

```bash
docker build -t agentrail-sandbox:ci docker/sandbox
```

Useful package-scoped checks:

```bash
pnpm --filter @agentrail/config test
pnpm --filter @agentrail/orchestration test
pnpm --filter @agentrail/sandbox typecheck
```

## When To Add A Changeset

Run this command when your change affects a published package:

```bash
pnpm changeset
```

`pnpm changeset` now uses Agentrail's guided generator. It writes the markdown file with package names and computed next version numbers in the filename instead of Changesets' default random adjective-based names.

If you ever need the original Changesets CLI, use:

```bash
pnpm changeset:cli
```

Add a changeset when you:

- change public APIs
- fix user-facing bugs in published packages
- add new functionality to a published package
- change runtime behavior that downstream users will notice
- change `docker/sandbox/**` in a way that should produce a new sandbox image

Usually do not add a changeset when you only:

- update docs
- change examples without affecting published packages
- adjust CI or local tooling only
- refactor internal code with no observable package change

## Choosing The Version Bump

- `patch`: backward-compatible bug fixes or small behavior improvements
- `minor`: backward-compatible new features
- `major`: breaking changes

If a Docker sandbox change should ship, select `@agentrail/sandbox` in the changeset. The release workflow uses that package version to tag the GHCR image.

## What Gets Published

Published npm packages live under `packages/*`.

These workspaces are not published:

- `examples/*`
- `docker/sandbox/browser-server`

npm packages are published to `npmjs`.
The sandbox container image is published to `ghcr.io/yai-dev/agentrail-sandbox`.

## CI And Release Flow

### Pull Requests

Every PR runs GitHub Actions CI:

- DCO sign-off check (all commits must have `Signed-off-by`)
- install dependencies
- build published packages
- run package tests
- run type checks
- build the sandbox Docker image for validation

### Merge To `master`

Merging normal feature PRs to `master` does not publish immediately.
Instead, the release workflow uses Changesets to create or update a Release PR that contains:

- version bumps
- changelog updates
- the exact set of packages to publish

### Merge The Release PR

Merging the Release PR triggers the actual release:

- changed npm packages are published to `npmjs`
- if `@agentrail/sandbox` is part of the release, the sandbox image is published to GHCR

The sandbox image receives these tags:

- `x.y.z`
- `x.y`
- `x`
- `latest`

## Secrets And Permissions

The release workflow expects:

- `NPM_TOKEN` repository secret for npm publishing
- built-in `GITHUB_TOKEN` for Release PR management and GHCR publishing

You do not need to create a custom GitHub token for the current workflow.

## Notes For Sandbox Development

`@agentrail/sandbox` now defaults to:

```text
ghcr.io/yai-dev/agentrail-sandbox:latest
```

For local development, point `config/agentrail.yaml` at a locally built image:

```yaml
sandbox:
  image: agentrail-sandbox:latest
```

Then build the local image:

```bash
docker build -t agentrail-sandbox:latest docker/sandbox
```

## AI Tools

AI tools are welcome for writing code, tests, and documentation. Contributors are responsible for understanding, testing, and standing behind everything they submit, regardless of how it was generated.

## Contributor Checklist

Before requesting review:

- all commits are signed off (`git commit -s`)
- `pnpm format` has been run and any formatting-only changes were reviewed
- local configuration is represented in `config/agentrail.yaml`
- code builds locally
- tests pass locally
- typecheck passes locally
- sandbox Docker build passes if relevant
- a changeset is included when a published package changed
- no unrelated files were modified accidentally
