# Prompts

Agentrail uses a prompt SDK instead of scattered ad hoc prompt loaders.

## Prompt Model

- A prompt is built from one or more fragments.
- Fragments are grouped into bundles.
- Bundles can be layered and rendered with runtime variables.

## Why This Matters

This model keeps hosted prompts, workflow prompts, and sub-agent prompts consistent across the framework.

## Recommended APIs

- `definePromptFragment`
- `definePromptBundle`
- `createPromptBuilder`
- `loadPromptFile`
- `renderPrompt`
