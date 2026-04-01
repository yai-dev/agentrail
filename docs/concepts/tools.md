# Tools

Tools are functions that an agent can invoke during its execution loop. They bridge the gap between language model reasoning and real-world actions.

## What a Tool Is

A `RuntimeTool` from `@agentrail/runtime-core` has four required parts:

| Part          | Purpose                                                                   |
| ------------- | ------------------------------------------------------------------------- |
| `name`        | Identifier sent to the LLM (used in tool call requests)                   |
| `label`       | Human-readable display label for UI and logs                              |
| `description` | Natural language description the LLM uses to decide when to call the tool |
| `parameters`  | TypeBox JSON schema describing the input shape                            |
| `execute`     | Async function that receives validated parameters and returns a result    |

The LLM does not execute tools directly. It produces a structured tool call request. The agent loop intercepts that request, validates the parameters against the schema, calls `execute`, and feeds the result back to the LLM.

## Defining a Tool

Use the `tool()` builder from `@agentrail/runtime-core`:

```ts
import { Type } from "@sinclair/typebox";
import { tool } from "@agentrail/runtime-core";

export const customerLookupTool = tool()
  .name("customer-lookup")
  .label("Customer Lookup")
  .description("Look up a customer by account ID.")
  .parameters(
    Type.Object({
      accountId: Type.String({ description: "The account identifier" }),
    })
  )
  .execute(async (params, ctx) => {
    const record = await db.customers.findById(params.accountId);
    return {
      content: [{ type: "text", text: JSON.stringify(record) }],
      details: record,
    };
  })
  .build();
```

For tools with no parameters, use `defineSimpleTool`:

```ts
import { defineSimpleTool } from "@agentrail/runtime-core";

export const pingTool = defineSimpleTool({
  name: "ping",
  description: "Check that the service is reachable.",
  async execute() {
    return { content: [{ type: "text", text: "pong" }], details: null };
  },
});
```

## Tool Result Shape

Every `execute` function must return a `ToolResult`:

```ts
{
  content: (TextContent | ImageContent)[]; // returned to the LLM
  details: TDetails;                       // structured data for the host/UI
}
```

`content` is what the LLM sees as the tool's response. `details` is structured data available to the host layer for logging, UI rendering, and event streaming.

## Streaming Tool Updates

For long-running tools, use `ctx.onUpdate` to emit intermediate results while the tool is still executing. The host forwards these as `tool_execution_update` events over SSE:

```ts
.execute(async (params, ctx) => {
  ctx.onUpdate({ content: [{ type: "text", text: "Starting..." }], details: null });
  const result = await longRunningTask(params.query);
  return { content: [{ type: "text", text: result }], details: result };
})
```

## Waiting for User Input

A tool can pause the agent loop and request input from the user:

```ts
.execute(async (params, ctx) => {
  ctx.onSignal?.({
    type: "waiting_for_input",
    question: "Which option do you prefer?",
    options: ["Option A", "Option B"],
  });
  // ...
})
```

The host emits a `waiting_for_user_input` event and the UI can surface the question to the user.

## Where Tools Come From

Tools in a hosted Agentrail app come from several sources:

### 1. Custom runtime tools

Domain-specific tools you define yourself using `tool()` or `defineSimpleTool`. These live in your app's packages or source files and are passed to a profile's `createAgent`.

### 2. `@agentrail/tools`

Built-in framework tools covering common patterns:

- ask-user style interactions
- task/todo progress writing
- basic host utility tools

### 3. Capability package tools

Each capability package exposes tools when wired into the host:

| Package                    | Example tools                                    |
| -------------------------- | ------------------------------------------------ |
| `@agentrail/knowledge`     | knowledge-search, knowledge-index                |
| `@agentrail/sandbox`       | run-code, read-file, write-file, browser         |
| `@agentrail/skills`        | skill-list, skill-invoke                         |
| `@agentrail/orchestration` | spawn-agent, send-input, wait-agent, close-agent |

Use `buildDefaultCapabilityTools` from `@agentrail/host/defaults` to assemble the recommended capability-oriented toolset in one call.

### 4. Orchestration tools

When a hosted profile uses the orchestration layer, the parent agent gets `spawn-agent`, `send-input`, `wait-agent`, and `close-agent` tools. These let it delegate work to sub-agents and wait for results.

## Assembling Tools in a Profile

Tools are assembled in the profile's `createAgent` function, not in route files:

```ts
defineHostedProfile({
  id: "default",
  createAgent: ({ tools }) => defineAgent({
    id: "default",
    model: { provider: "anthropic", modelId: "claude-sonnet-4-5" },
    system: systemPrompt,
    tools: [...tools, customerLookupTool, pingTool],
  }),
});
```

The `tools` argument here comes from the defaults layer's capability tool assembly. You extend it with your own tools.

## What Does Not Belong in a Tool

Tools should be pure runtime concerns. Avoid:

- HTTP request parsing or route-level logic (belongs in plugins or routes)
- session management (belongs in the host layer)
- system prompt content (belongs in profiles or prompt bundles)
- cross-cutting host behavior (belongs in plugins)

## Related Concepts

- [Agents](agents.md)
- [Profiles](profiles.md)
- [Orchestration](orchestration.md)

## Related Reference

- [Add Tools Guide](../guides/add-tools.md)
- [Host Defaults Reference](../reference/host-defaults.md)
