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

### 1. Use `@agentrail/tools`

Use built-in helper tools when the framework already provides the behavior you need.

Examples include:

- ask-user style interactions
- todo/task progress writing
- basic helper utilities shared across hosts

This is the lowest-friction path when you want a working host quickly.

### 2. Define a custom runtime tool

Use `tool()` or `defineSimpleTool()` from `@agentrail/runtime-core` when:

- your app needs a domain-specific tool
- the logic belongs to runtime execution rather than host routing
- you want the same tool to be reusable across multiple profiles

This is the right layer for:

- product-specific data retrieval
- internal workflow actions
- reusable agent-side capabilities

### 3. Use the defaults layer for hosted composition

Use `createDefaultToolset` or `buildDefaultCapabilityTools` when you want the recommended hosted composition path.

This is especially useful when you want to combine:

- execution tools
- browser tools
- orchestration tools
- capability tools
- optional app-specific tools

## Minimal Custom Tool Example

```ts
import { Type } from "@sinclair/typebox";
import { tool } from "@agentrail/runtime-core";

export const customerLookupTool = tool({
  name: "CustomerLookup",
  label: "Customer Lookup",
  description: "Look up customer details by account id.",
  parameters: Type.Object({
    accountId: Type.String(),
  }),
  async execute(_toolCallId, params) {
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

## Recommended Assembly Pattern

Once you have one or more tools, assemble them in the host/profile layer rather than directly inside routes.

A common pattern is:

1. define reusable tools in a package or app-local runtime module
2. build a tool list in one place
3. pass that list into your profile’s `createAgent`

This keeps route files small and avoids duplicated tool lists.

## Repository Example

The current repository shows two useful patterns:

- default capability assembly in:
  - [packages/host/src/defaults/capability-tools.ts](../../packages/host/src/defaults/capability-tools.ts)
- default toolset merging in:
  - [packages/host/src/defaults/toolset.ts](../../packages/host/src/defaults/toolset.ts)

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
- [Host Defaults Reference](../reference/host-defaults.md)

## Next Step

Once your toolset is defined, the next common step is [Add Context](add-context.md) so the agent has the right request-time information.
