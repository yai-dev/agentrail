# Profiles

A hosted profile describes how a host should create and run an agent for a request.

## Why Profiles Exist

Profiles keep host wiring separate from agent implementation details.

They let you define:

- profile identity
- agent creation logic
- prompt builder integration
- optional hosted request behavior

## Recommended API

Use `defineHostedProfile` from `@agentrail/host/defaults` for the default developer path.

Use lower-level host primitives only if you need a custom resolver model.
