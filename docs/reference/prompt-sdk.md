# Prompt SDK Reference

`@agentrail/core` provides the shared prompt composition and loading model used across profiles, sub-agents, and workflow packages.

## When To Read This Page

Read this page when:

- your prompts are growing beyond a single string literal
- you need layering, file-backed loading, or variable interpolation
- you want to understand the Agentrail prompt model before building a profile

The SDK exists so every part of the framework — profiles, sub-agent runtimes, workflow packages — uses the same assembly model instead of inventing its own loader.

---

## Core Types

```ts
// A named prompt unit
interface PromptFragment {
  key: string;
  content?: string; // inline content, OR
  filePath?: string; // file path (mutually exclusive with content)
  stripMetadata?: boolean; // strip <!-- --> frontmatter (default: true for loadFile)
}

// A layer in the four-level model
interface PromptLayer {
  fragments?: PromptFragment[];
  replace?: Record<string, PromptFragment>; // override a fragment by key
  vars?: PromptVars;
}

// A full prompt composed of up to four layers
interface PromptBundle {
  vars?: PromptVars; // bundle-level default variables
  base?: PromptLayer;
  capability?: PromptLayer;
  profile?: PromptLayer;
  mode?: PromptLayer;
}

type PromptVars = Record<string, string | number | boolean | null | undefined>;
type PromptLayerName = "base" | "capability" | "profile" | "mode";
```

Layers are rendered in order: `base → capability → profile → mode`. Each layer's fragments are joined with double newlines.

---

## Main APIs

### `definePromptFragment`

Defines a named prompt fragment. Returns the fragment unchanged — exists for type safety and IDE autocomplete.

```ts
import { definePromptFragment } from "@agentrail/core";

// Inline content
export const baseInstructions = definePromptFragment({
  key: "base.instructions",
  content: `
You are a helpful AI assistant. Be concise, accurate, and professional.
When uncertain, ask clarifying questions rather than guessing.
  `.trim(),
});

// File-backed (loaded at render time, mtime-cached)
export const safetyRules = definePromptFragment({
  key: "base.safety",
  filePath: new URL("./safety.md", import.meta.url).pathname,
  stripMetadata: true, // strips <!-- --> frontmatter comments (default: true)
});

// With a variable placeholder
export const personaFragment = definePromptFragment({
  key: "profile.persona",
  content: "Your name is ${agentName}. Your role is ${role}.",
});
```

---

### `definePromptBundle`

Defines an ordered bundle of fragments across the four layers. Returns the bundle unchanged — exists for type safety.

```ts
import { definePromptBundle } from "@agentrail/core";
import { baseInstructions, safetyRules, personaFragment } from "./fragments.js";

export const supportBundle = definePromptBundle({
  // Bundle-level default variables (overridable at render time)
  vars: {
    agentName: "Support Agent",
    role: "customer support assistant",
  },

  base: {
    fragments: [baseInstructions, safetyRules],
  },

  capability: {
    fragments: [
      definePromptFragment({
        key: "capability.tools",
        content: "You have access to file editing and search tools.",
      }),
    ],
  },

  profile: {
    fragments: [personaFragment],
  },
  // mode layer is optional — used for workflow-specific overrides
});
```

---

### `createPromptBuilder`

Creates a per-instance builder from a bundle. The builder holds its own `PromptLoader` cache (isolated — no shared state between instances or test runs).

```ts
import { createPromptBuilder } from "@agentrail/core";
import { supportBundle } from "./prompts/support-bundle.js";

// Create once per profile or per request, not once globally
const builder = createPromptBuilder(supportBundle);

// Render with default variables from the bundle
const system = builder.render();

// Render with variable overrides
const systemWithContext = builder.render({
  vars: {
    agentName: "Alex",
    role: "senior support specialist",
  },
});

// Render with an overlay bundle (merges on top of the base bundle)
const systemWithMode = builder.render({
  overlay: {
    mode: {
      fragments: [
        definePromptFragment({
          key: "mode.research",
          content: "Focus only on technical documentation questions.",
        }),
      ],
    },
  },
});

// Render with an entirely different bundle (replaces the base bundle)
const systemFromOtherBundle = builder.render({
  bundle: otherBundle,
});
```

#### `PromptBuilder` interface

```ts
interface PromptBuilder {
  render(options?: {
    vars?: PromptVars;
    overlay?: PromptBundle; // merge on top of the base bundle
    bundle?: PromptBundle; // replace the base bundle entirely
  }): string;
  clearCache(): void; // clear the internal mtime cache
}
```

---

### `renderPrompt`

A standalone function that interpolates `${variable}` placeholders in a plain string. Used internally by the bundle renderer.

```ts
import { renderPrompt } from "@agentrail/core";

const template = "Hello, ${name}! You are working on ${project}.";
const rendered = renderPrompt(template, { name: "Alice", project: "Agentrail" });
// → "Hello, Alice! You are working on Agentrail."

// Unresolved variables are left as-is (not thrown):
const partial = renderPrompt("Hello ${name}, your id is ${id}.", { name: "Alice" });
// → "Hello Alice, your id is ${id}."
```

Variable syntax: `${key}` where `key` matches `[A-Za-z0-9_]+`. Values are coerced to string; `null` and `undefined` become `""`.

---

### `loadPromptFile` _(deprecated)_

> **Deprecated.** `loadPromptFile` uses a module-level singleton cache that leaks state across test runs and independent instances. Migrate to `createPromptBuilder` instead.

**Migration:**

```ts
// Before (deprecated)
import { loadPromptFile } from "@agentrail/core";
const text = loadPromptFile("/path/to/system.md");

// After — use builder.loadFile or a PromptLoader instance
import { createPromptBuilder, definePromptBundle } from "@agentrail/core";
const builder = createPromptBuilder(
  definePromptBundle({
    base: {
      fragments: [{ key: "main", filePath: "/path/to/system.md" }],
    },
  }),
);
const text = builder.render();
```

---

## End-to-End Example

A complete prompt setup for a hosted profile:

```ts
// prompts/fragments.ts
import { definePromptFragment } from "@agentrail/core";

export const behaviorFragment = definePromptFragment({
  key: "base.behavior",
  content: `
You are a concise, accurate assistant.
Never guess — ask for clarification when uncertain.
Today's date is \${currentDate}.
  `.trim(),
});

export const toolsFragment = definePromptFragment({
  key: "capability.tools",
  content: "You can read and write files using the provided file tools.",
});

export const personaFragment = definePromptFragment({
  key: "profile.persona",
  filePath: new URL("./persona.md", import.meta.url).pathname,
});
```

```ts
// prompts/bundle.ts
import { definePromptBundle } from "@agentrail/core";
import { behaviorFragment, toolsFragment, personaFragment } from "./fragments.js";

export const agentBundle = definePromptBundle({
  vars: { currentDate: new Date().toISOString().slice(0, 10) },
  base: { fragments: [behaviorFragment] },
  capability: { fragments: [toolsFragment] },
  profile: { fragments: [personaFragment] },
});
```

```ts
// profiles/my-profile.ts
import { createPromptBuilder } from "@agentrail/core";
import { defineProfile } from "@agentrail/app";
import { agentBundle } from "../prompts/bundle.js";

export const myProfile = defineProfile({
  id: "default",
  name: "Default Agent",
  agent: {
    model: "anthropic:claude-sonnet-4-5",
    prompt: () => {
      const builder = createPromptBuilder(agentBundle);
      return builder.render({
        vars: { currentDate: new Date().toISOString().slice(0, 10) },
      });
    },
  },
});
```

---

## Layering Strategy

The four-layer model serves a specific purpose:

| Layer        | Purpose                     | Examples                                        |
| ------------ | --------------------------- | ----------------------------------------------- |
| `base`       | General behavior rules      | Safety, output formatting, uncertainty handling |
| `capability` | Available tool descriptions | File tools, KB access, skills                   |
| `profile`    | Role/persona/mission        | "You are a support agent for Acme Corp"         |
| `mode`       | Workflow-specific narrowing | "Focus only on the research phase"              |

A workflow package typically overrides the `mode` layer without touching `base` or `profile`.

---

## Recommended File Organization

```
prompts/
  fragments/
    behavior.ts
    tools.ts
    safety.md
  profiles/
    support.ts
    researcher.ts
  bundles/
    support-bundle.ts
    researcher-bundle.ts
```

Define one bundle per hosted profile or workflow role. Keep fragment files small and focused.

---

## What To Avoid

- One giant system prompt string with no structure
- Multiple independent loaders with different metadata stripping rules
- Embedding prompts directly in route files
- Sharing a `PromptBuilder` instance across requests (it carries a file cache that can become stale)

## Related Docs

- [Concepts: Prompts](../concepts/prompts.md)
- [Manage Prompts Guide](../guides/manage-prompts.md)
- [Build a Profile Guide](../guides/build-a-profile.md)
