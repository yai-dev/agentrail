# Manage Prompts

Use the prompt SDK to keep prompt composition explicit and reusable.

## Prerequisites

Read this guide after:

- [Quickstart](quickstart.md)
- [Build a Profile](build-a-profile.md)
- [Concepts: Prompts](../concepts/prompts.md)

Prompt management becomes painful quickly if every profile or workflow invents its own loader, file format, and override rules. Agentrail’s prompt SDK exists to prevent that drift.

## What Problem The Prompt SDK Solves

Without a shared prompt layer, teams usually end up with some mix of:

- large system prompt strings embedded inside route files
- ad hoc markdown loading helpers
- inconsistent metadata stripping
- duplicated prompt files for different modes
- unclear override rules between base behavior and workflow-specific behavior

`@agentrail/prompts` gives you one model for all of those cases.

## Recommended Structure

Use this mental model:

- base fragments for general behavior
- capability fragments for memory/knowledge/skills behavior
- profile fragments for agent-specific behavior
- workflow fragments for specialized modes

A typical directory shape looks like this:

```text
src/prompts/
  base/
  capabilities/
  profiles/
  workflows/
```

You do not need every folder from day one, but it is helpful to keep the categories explicit once prompts start to grow.

## Core Building Blocks

The prompt SDK revolves around:

- `definePromptFragment`
- `definePromptBundle`
- `createPromptBuilder`
- `loadPromptFile`
- `renderPrompt`

Use them like this:

- fragments define the smallest reusable units
- bundles define ordered prompt collections
- builders apply layering, caching, variables, and overrides
- renderers produce the final prompt text passed into a profile or workflow

## File-Backed Prompt Example

```ts
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPromptBuilder, definePromptBundle, definePromptFragment } from "@agentrail/prompts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const systemPromptBuilder = createPromptBuilder(
  definePromptBundle({
    base: {
      fragments: [
        definePromptFragment({
          key: "identity",
          filePath: join(__dirname, "system-prompt-identity.md"),
          stripMetadata: true,
        }),
        definePromptFragment({
          key: "behavior",
          filePath: join(__dirname, "system-prompt-behavior.md"),
          stripMetadata: true,
        }),
      ],
    },
  }),
);
```

This is the same style used by the playground example in:

- [examples/playground-server/src/prompts/index.ts](../../examples/playground-server/src/prompts/index.ts)

## Layering Strategy

Agentrail’s recommended layering order is:

1. `base`
2. `capability`
3. `profile`
4. `mode` or `workflow`

That means:

- the base layer defines default agent behavior
- the capability layer explains what the host/runtime can do
- the profile layer defines the identity and mission of the profile
- the mode/workflow layer narrows behavior for a specialized path

This layering matters because it helps teams answer:

- which prompt content is universal
- which prompt content belongs to one app/profile
- which prompt content belongs to only one request mode

## Variables

Use variables for small dynamic values, for example:

- current date
- profile name
- active mode
- environment hints

Do not use variables as a replacement for real composition. If one prompt shape is structurally different from another, create separate fragments or bundles instead of putting too much conditional logic into a template.

## Ownership Rules

A good prompt ownership model is:

- framework packages own framework-level prompt infrastructure
- workflow packages own workflow role prompts
- example apps own example-specific prompt content

That means the prompt SDK lives in `packages/prompts`, but the actual content can live close to the code that owns it.

For example:

- a host profile can keep prompts near the profile
- a workflow package such as deep research can keep its role prompts inside the workflow package

## Repository Examples

Current examples in this repository:

- playground hosted system prompt:
  - [examples/playground-server/src/prompts/index.ts](../../examples/playground-server/src/prompts/index.ts)
- deep-research workflow prompts:
  - [packages/deep-research/src/prompts.ts](../../packages/deep-research/src/prompts.ts)

These show two useful patterns:

- one bundle for a hosted assistant profile
- multiple role prompts for a workflow package

## Prompt Review Checklist

When prompts start becoming hard to maintain, check for these smells:

- one file contains too many unrelated instructions
- capability guidance is mixed directly into workflow-only prompts
- profile identity and mode-specific behavior are duplicated across files
- routes or plugins know too much about prompt structure

Usually the fix is to split fragments more cleanly, not to add more comments around a giant prompt string.

## Recommendation

Keep prompt files close to the package or example that owns them, but use the shared SDK for loading and rendering.

Start simple, but make fragment identity explicit early. That one discipline makes future override and reuse much easier.

## Next Steps

Once your prompts are structured, the next useful step is to wire them into a hosted profile:

- [Build a Profile](build-a-profile.md)
- [Prompt SDK Reference](../reference/prompt-sdk.md)

## Next Step

When you need the API-level details, continue with [Prompt SDK Reference](../reference/prompt-sdk.md).
