# Prompt SDK Reference

`@agentrail/prompts` provides the shared prompt-loading and composition model.

## When To Read This Page

Read this page when:

- your prompts are growing beyond one or two string literals
- you need layering, overrides, or file-backed prompt loading
- you want to understand how Agentrail expects prompts to be structured

It exists so Agentrail profiles, sub-agent runtimes, and workflow packages can all use the same prompt assembly model instead of each inventing a loader and override system.

## Mental Model

The prompt SDK is built around three ideas:

- **fragments**: small prompt units with stable identity
- **bundles**: ordered collections of fragments
- **builders/renderers**: the runtime layer that composes, overrides, and renders final prompt text

This lets you evolve prompts without turning every profile into one large string literal.

## Main APIs

- `definePromptFragment`
- `definePromptBundle`
- `createPromptBuilder`
- `loadPromptFile`
- `renderPrompt`

## API Roles

### `definePromptFragment`

Defines a named prompt fragment.

Use a fragment when you want a prompt unit that is:

- easy to reuse
- easy to override by id
- small enough to reason about independently

Typical fragment categories:

- base behavioral instructions
- tool-usage rules
- safety/guardrail rules
- domain-specific context
- mode-specific instructions

### `definePromptBundle`

Defines an ordered bundle of fragments.

Use bundles for:

- a hosted profile system prompt
- a sub-agent runtime prompt
- workflow role prompts such as planner / researcher / reporter

### `createPromptBuilder`

Creates a builder that can compose bundles, merge layers, inject variables, and apply overrides before rendering.

This is the piece to use when you want:

- layered prompt assembly
- environment- or profile-specific overrides
- runtime variable injection

### `loadPromptFile`

Loads a file-backed prompt fragment from markdown.

This is the recommended file-backed path when you want prompts to live outside source string literals.

### `renderPrompt`

Renders a final prompt string from one bundle or from a builder result.

## Supported Capabilities

- fragment composition
- file-backed prompts
- variable interpolation
- metadata stripping
- simple layered bundle overrides

## Layering Strategy

The recommended layering order in Agentrail is:

1. `base`
2. `capability`
3. `profile`
4. `mode` or `workflow`

This means:

- base fragments define general behavior
- capability fragments describe available tools, memory, or host capabilities
- profile fragments define the role/persona/mission
- mode/workflow fragments narrow the prompt for a specific path such as deep research

## Variables

Variable interpolation is intentionally simple.

Use it for data such as:

- profile name
- runtime mode
- current date
- tenant or environment hints

Avoid using variable interpolation as a full template language. If a prompt has highly conditional structure, prefer composing different fragments or bundles instead.

## Recommended File Organization

For most apps, this works well:

```text
prompts/
  base/
  capabilities/
  profiles/
  workflows/
```

Then define one bundle per hosted profile or workflow role.

## What To Avoid

Avoid these patterns:

- one giant system prompt string with no structure
- multiple loaders with different metadata stripping rules
- embedding all prompts directly into route files
- putting profile prompt logic into host route glue

The prompt SDK is meant to keep prompt structure explicit and evolvable as your host grows.
