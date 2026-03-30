This directory stores Changesets release metadata for Agentrail.

- Run `pnpm changeset` when a change should affect a published package.
- Merge regular PRs into `master`; the release workflow will open or update a release PR.
- Merge the release PR to publish changed npm packages and, when `@agentrail/sandbox` changes, the GHCR sandbox image.
