# Deep Research Example

Deep Research is the main workflow example built on top of Agentrail orchestration.

It shows how Agentrail can be used for something more structured than a chat assistant: a workflow with planning, delegated execution, source handling, artifact generation, and reporting.

## What It Demonstrates

- workflow-specific planning and reporting
- delegated sub-agent execution
- orchestration state handling
- workflow prompts layered on top of framework prompts

## Why This Example Matters

The deep-research example is important because it demonstrates that Agentrail is not limited to:

- one-turn chat tools
- assistant-style request/response apps
- simple hosted profile assembly

It shows a higher-level pattern:

- the framework core stays generic
- the workflow package owns domain-specific coordination
- the example app only wires runtime configuration and routes

That separation is one of the main design goals of Agentrail.

## Main Files To Read

Start with these files:

- example route wiring:
  - [examples/deep-research/src/routes/run.ts](../../examples/deep-research/src/routes/run.ts)
  - [examples/deep-research/src/routes/deep-research.ts](../../examples/deep-research/src/routes/deep-research.ts)
- example runtime config:
  - [examples/deep-research/src/config.ts](../../examples/deep-research/src/config.ts)
- workflow package entrypoint:
  - [packages/deep-research/src/index.ts](../../packages/deep-research/src/index.ts)
- workflow coordinator:
  - [packages/deep-research/src/coordinator.ts](../../packages/deep-research/src/coordinator.ts)
- workflow prompt assembly:
  - [packages/deep-research/src/prompts.ts](../../packages/deep-research/src/prompts.ts)

## Execution Shape

The deep-research workflow has a different shape from a normal hosted assistant.

At a high level it does this:

1. accept a research request
2. initialize workflow state
3. generate or normalize a plan
4. delegate parts of the work to managed sub-agents
5. collect and filter sources
6. generate artifacts and a report
7. expose run state through query routes

That makes it a strong example of how orchestration and workflows sit on top of the same underlying host/runtime foundation.

## What Is Framework-Level

Framework-level pieces used by this example include:

- `@agentrail/runtime-core`
- `@agentrail/orchestration`
- `@agentrail/prompts`
- host integration patterns such as session stores and route factories

These are reusable across many applications, not just research workflows.

## What Is Workflow-Specific

The deep-research package adds workflow-specific concerns such as:

- research planning logic
- source scoring and normalization
- artifact bookkeeping
- report generation flow
- entity/profile normalization rules

Those concerns do not belong in the framework core because they are specific to this kind of workflow.

## Why The Workflow Lives In A Package

The workflow implementation lives in `packages/deep-research` rather than directly inside the example app.

That choice matters because it proves the workflow is:

- reusable
- testable
- not tightly coupled to one example route tree

The example app is mainly responsible for:

- providing runtime config
- choosing ports and YAML configuration values
- mounting routes
- choosing a session store

## How To Use This Example

Use this example when you want to study:

- how to build a workflow package on top of Agentrail
- how orchestration-backed execution can remain separate from hosted route glue
- how prompts, state, and reporting can belong to a workflow package instead of the host

If your app is “agent plus workflow” rather than “agent plus chat”, this example is often more relevant than the playground server.

## Related Docs

- [Architecture Overview](../architecture/README.md)
- [Concepts: Events and Orchestration](../concepts/events-and-orchestration.md)
- [Examples: Playground Server](playground-server.md)
