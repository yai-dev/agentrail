# Tools

Tools are functions that an agent can invoke during its execution loop. They bridge the gap between language model reasoning and real-world actions.

## What a Tool Is

A `RuntimeTool` from `@agentrail/core` has four required parts:

| Part          | Purpose                                                                   |
| ------------- | ------------------------------------------------------------------------- |
| `name`        | Identifier sent to the LLM (used in tool call requests)                   |
| `label`       | Human-readable display label for UI and logs                              |
| `description` | Natural language description the LLM uses to decide when to call the tool |
| `parameters`  | TypeBox JSON schema describing the input shape                            |
| `execute`     | Async function that receives validated parameters and returns a result    |

The LLM does not execute tools directly. It produces a structured tool call request. The agent loop intercepts that request, validates the parameters against the schema, calls `execute`, and feeds the result back to the LLM.

## Defining a Tool

Use the `defineTool()` builder from `@agentrail/core`:

```ts
import { Type } from "@sinclair/typebox";
import { defineTool } from "@agentrail/core";

export const customerLookupTool = defineTool()
  .name("customer-lookup")
  .label("Customer Lookup")
  .description("Look up a customer by account ID.")
  .parameters(
    Type.Object({
      accountId: Type.String({ description: "The account identifier" }),
    }),
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
import { defineSimpleTool } from "@agentrail/core";

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

### 2. `@agentrail/capabilities` built-in tools

The capabilities package exposes tools for common patterns:

- ask-user style interactions
- task/todo progress writing
- file system, browser, knowledge retrieval
- orchestration tools for multi-agent workflows

Capability tools are added to a profile via `defineProfile({ capabilities: [...] })`:

| Capability         | Example tools                                    |
| ------------------ | ------------------------------------------------ |
| `knowledge(km)`    | knowledge-search, knowledge-index                |
| `filesystem(sbm)`  | run-code, read-file, write-file, browser         |
| `skills(sm)`       | skill-list, skill-invoke                         |
| `orchestration(r)` | spawn-agent, send-input, wait-agent, close-agent |

### 4. Orchestration tools

When a hosted profile uses the orchestration layer, the parent agent gets `spawn-agent`, `send-input`, `wait-agent`, and `close-agent` tools. These let it delegate work to sub-agents and wait for results.

## Assembling Tools in a Profile

Tools are assembled in `defineProfile`, not in route files:

```ts
import { defineProfile } from "@agentrail/app";
import { filesystem } from "@agentrail/capabilities";

export const defaultProfile = defineProfile({
  id: "default",
  model: "anthropic/claude-sonnet-4-5",
  system: systemPrompt,
  tools: [customerLookupTool, pingTool],
  capabilities: [filesystem(sandboxManager)],
});
```

`defineProfile` merges your `tools` with the tools provided by each capability descriptor automatically.

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
- [Use Capability Packages Guide](../guides/use-capability-packages.md)
