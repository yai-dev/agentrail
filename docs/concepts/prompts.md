# Prompts

Agentrail provides a structured prompt SDK instead of ad hoc string concatenation. It gives prompts a stable identity, supports layering and overrides, and handles runtime variable injection.

## Why a Prompt SDK

As an agent application grows, system prompts accumulate:

- base behavioral instructions
- tool-usage rules
- capability descriptions
- profile-specific role and persona
- mode or workflow-specific instructions

Without structure, these collapse into one unmanageable string. The prompt SDK makes each piece independently named, testable, and overridable.

## The Three-Level Model

### Fragment

A `PromptFragment` is the smallest unit — a named piece of prompt content:

```ts
import { definePromptFragment } from "@agentrail/prompts";

const coreFragment = definePromptFragment({
  key: "core-behavior",
  content: "You are a helpful assistant. Be concise and accurate.",
});

const toolRulesFragment = definePromptFragment({
  key: "tool-rules",
  filePath: new URL("./tool-rules.md", import.meta.url).pathname,
});
```

Fragments can be defined inline (via `content`) or loaded from a Markdown file (via `filePath`). File-backed fragments are cached by modification time and automatically reloaded in development.

### Bundle

A `PromptBundle` is an ordered collection of fragments organized into named layers:

```ts
import { definePromptBundle } from "@agentrail/prompts";

const myBundle = definePromptBundle({
  base: {
    fragments: [coreFragment, safetyFragment],
  },
  capability: {
    fragments: [memoryFragment, knowledgeFragment],
  },
  profile: {
    fragments: [assistantPersonaFragment],
    vars: { profileName: "Aria" },
  },
});
```

The four standard layers, rendered in order:

| Layer        | Purpose                                            |
| ------------ | -------------------------------------------------- |
| `base`       | General behavior, tone, safety rules               |
| `capability` | Descriptions of available tools, memory, knowledge |
| `profile`    | Role, persona, mission for this specific agent     |
| `mode`       | Narrow overrides for a specific workflow or mode   |

Layers can also specify per-fragment `replace` overrides to swap a fragment from a lower layer without redefining the whole layer.

### Prompt Builder

`createPromptBuilder` assembles a bundle and handles rendering:

```ts
import { createPromptBuilder } from "@agentrail/prompts";

const builder = createPromptBuilder(myBundle);

// Render with optional runtime variables and overrides
const systemPrompt = builder.render({
  vars: {
    currentDate: new Date().toISOString(),
    tenantName: context.tenantId,
  },
  overlay: {
    mode: {
      fragments: [researchModeFragment],
    },
  },
});
```

The `overlay` option lets you inject an additional layer at render time — useful for workflows that need to narrow the prompt without changing the base bundle.

## Prompt Variables

Variables are interpolated into fragment content using `{{variableName}}` syntax:

```md
You are {{profileName}}, an assistant for {{tenantName}}.
Today is {{currentDate}}.
```

Variables can be defined at the bundle level (as defaults) and overridden at render time. Keep variables simple — strings, numbers, and booleans. If a prompt needs highly conditional structure, compose different fragments or bundles instead of using complex variable logic.

## File-Backed Prompts

Large prompt fragments are easier to write and review as Markdown files:

```ts
const systemFragment = definePromptFragment({
  key: "system",
  filePath: new URL("./prompts/system.md", import.meta.url).pathname,
  stripMetadata: true, // strip YAML frontmatter before rendering
});
```

The `PromptLoader` inside `createPromptBuilder` caches files by modification time — changes are picked up automatically on the next render without restarting the process.

## Using Prompts in a Profile

In a hosted profile, pass the bundle to `defineHostedProfile`:

```ts
defineHostedProfile({
  id: "default",
  name: "Default Assistant",
  prompt: myBundle,
  createAgent: ({ systemPrompt, tools }) =>
    defineAgent({
      id: "default",
      model: { provider: "anthropic", modelId: "claude-sonnet-4-5" },
      system: systemPrompt,
      tools,
    }),
});
```

The defaults layer renders the bundle (with request-time variables) and passes the resulting string as `systemPrompt` to `createAgent`.

## Recommended File Organization

```
src/prompts/
  base/
    core.md
    safety.md
  capabilities/
    memory.md
    knowledge.md
  profiles/
    assistant.md
  workflows/
    deep-research.md
```

Define one bundle per hosted profile or workflow role. Keep fragments small enough to review independently.

## `loadPromptFile` (Deprecated)

The older `loadPromptFile` function used a module-level singleton cache. It is deprecated in favor of `createPromptBuilder`, which creates a private, instance-scoped loader:

```ts
// Deprecated
import { loadPromptFile } from "@agentrail/prompts";
const text = loadPromptFile("/path/to/system.md");

// Recommended
import { createPromptBuilder } from "@agentrail/prompts";
const builder = createPromptBuilder(myBundle);
const text = builder.loadFile("/path/to/system.md");
```

## Related Concepts

- [Profiles](profiles.md)
- [Agents](agents.md)

## Related Reference

- [Prompt SDK Reference](../reference/prompt-sdk.md)
- [Manage Prompts Guide](../guides/manage-prompts.md)
