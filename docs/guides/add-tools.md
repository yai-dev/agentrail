# Add Tools

Add tools at the runtime layer, then compose them into hosted profiles.

## Prerequisites

Read this guide after:

- [Quickstart](quickstart.md)
- [Build a Profile](build-a-profile.md)
- [Concepts: Agents](../concepts/agents.md)

In Agentrail, tools are runtime concerns first and host concerns second:

- the runtime defines what a tool is
- the host decides which tools are available to a profile

That split matters because it keeps tool logic reusable across hosted apps, workflows, and profiles.

## Two Levels Of Tool Work

Most teams touch tools in two places:

1. **tool implementation**
   - define the actual tool contract and execution behavior
2. **tool assembly**
   - choose which tools a hosted profile or workflow should expose

Agentrail intentionally keeps those separate.

## Your Main Options

### 1. Use `@agentrail/capabilities`

Use built-in capability tools when the framework already provides the behavior you need.

Examples include:

- ask-user style interactions
- todo/task progress writing
- filesystem, browser, knowledge, and orchestration tools

This is the lowest-friction path when you want a working host quickly. Add capabilities to a profile via:

```ts
import { defineProfile } from "@agentrail/app";
import { filesystem } from "@agentrail/capabilities";

export const defaultProfile = defineProfile({
  id: "default",
  name: "Default Assistant",
  agent: {
    model: "anthropic:claude-sonnet-4-5",
    prompt: "You are a helpful assistant.",
  },
  capabilities: [filesystem({ sandboxManager })],
});
```

### 2. Define a custom runtime tool

Use `defineTool()` from `@agentrail/core` when:

- your app needs a domain-specific tool
- the logic belongs to runtime execution rather than host routing
- you want the same tool to be reusable across multiple profiles

This is the right layer for:

- product-specific data retrieval
- internal workflow actions
- reusable agent-side capabilities

### 3. Compose tools in `defineProfile`

Pass tools directly into `defineProfile` or mix custom tools with capability descriptors:

```ts
import { defineProfile } from "@agentrail/app";
import { filesystem } from "@agentrail/capabilities";
import { customerLookupTool } from "./tools/customer-lookup.js";

export const supportProfile = defineProfile({
  id: "support",
  name: "Support Assistant",
  agent: {
    model: "anthropic:claude-sonnet-4-5",
    prompt: "You are a support assistant.",
    tools: [customerLookupTool],
  },
  capabilities: [filesystem({ sandboxManager })],
});
```

This is especially useful when you want to combine:

- custom domain tools
- built-in capability tools (execution, browser, orchestration, knowledge)
- optional app-specific utilities

## Minimal Custom Tool Example

```ts
import { Type } from "@sinclair/typebox";
import { defineTool } from "@agentrail/core";

export const customerLookupTool = defineTool({
  name: "customer_lookup",
  description: "Look up customer details by account id.",
  parameters: Type.Object({
    accountId: Type.String(),
  }),
  async execute(params) {
    return {
      content: [
        {
          type: "text",
          text: `Customer ${params.accountId} is active.`,
        },
      ],
      details: { accountId: params.accountId, status: "active" },
    };
  },
});
```

The important part is not the exact helper name. The important part is that the tool stays framework/runtime-facing and does not depend on route glue.

## Adding Business-Logic Validation

Use the optional `validate` field to add precondition checks that run after schema validation and any plugin-level argument rewrites, but before `execute`. Return `{ valid: false, reason }` to abort execution with a model-visible error message:

```ts
import { Type } from "@sinclair/typebox";
import { defineTool } from "@agentrail/core";

export const transferTool = defineTool({
  name: "transfer_funds",
  description: "Transfer an amount between two accounts.",
  parameters: Type.Object({
    fromAccountId: Type.String(),
    toAccountId: Type.String(),
    amount: Type.Number({ minimum: 0.01 }),
  }),
  async validate(params) {
    const balance = await getBalance(params.fromAccountId);
    if (balance < params.amount) {
      return { valid: false, reason: "Insufficient funds" };
    }
    return { valid: true };
  },
  async execute(params) {
    await doTransfer(params.fromAccountId, params.toAccountId, params.amount);
    return {
      content: [{ type: "text", text: "Transfer complete." }],
      details: null,
    };
  },
});
```

When validation fails the agent receives `"Tool precondition failed: <reason>"`. If `validate` throws, the thrown message is used as the reason. `execute` and `onAfterToolCall` are not called in either case.

## Recommended Assembly Pattern

Once you have one or more tools, assemble them in the host/profile layer rather than directly inside routes.

A common pattern is:

1. define reusable tools in a package or app-local runtime module
2. build a tool list in one place
3. pass that list into your profile’s `agent.tools` or dynamic `createAgent`

This keeps route files small and avoids duplicated tool lists.

## Repository Example

The current repository shows capability composition patterns in:

- `packages/capabilities/src/` — capability descriptor factories (`filesystem`, `knowledge`, `orchestration`, etc.)
- `packages/app/src/profile/define-profile.ts` — how `defineProfile` assembles tools from capability descriptors

These are good references for:

- how to build capability-oriented tool groups
- how to merge tool groups into one profile-facing list

## Choosing The Right Home For A Tool

Use this rule of thumb:

- put reusable domain or capability tools in `packages/*`
- put example-only tools in the owning example app
- keep tool execution logic out of route files

If a “tool” starts depending on HTTP request parsing, route semantics, or UI-only behavior, it is probably not actually a runtime tool.

## Common Mistakes

Avoid these patterns:

- assembling tools separately in every route
- putting prompt behavior inside tool implementations
- using plugins for logic that should be a runtime tool
- baking app-only environment parsing directly into reusable tool factories

## Recommendation

Keep reusable tool factories in packages and keep profile-specific assembly in the host layer.

Start with the defaults layer when possible, then add custom tools only where your app genuinely needs them.

## Related Docs

- [Build a Profile](build-a-profile.md)
- [Add Context](add-context.md)
- [Use Capability Packages](use-capability-packages.md)

## Next Step

Once your toolset is defined, the next common step is [Add Context](add-context.md) so the agent has the right request-time information.
