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
  - [examples/deep-research/src/routes/run.ts](https://github.com/yai-dev/agentrail/blob/main/examples/deep-research/src/routes/run.ts)
  - [examples/deep-research/src/routes/deep-research.ts](https://github.com/yai-dev/agentrail/blob/main/examples/deep-research/src/routes/deep-research.ts)
- example runtime config:
  - [examples/deep-research/src/config.ts](https://github.com/yai-dev/agentrail/blob/main/examples/deep-research/src/config.ts)
- workflow package entrypoint:
  - [packages/deep-research/src/index.ts](https://github.com/yai-dev/agentrail/blob/main/packages/deep-research/src/index.ts)
- workflow coordinator:
  - [packages/deep-research/src/coordinator.ts](https://github.com/yai-dev/agentrail/blob/main/packages/deep-research/src/coordinator.ts)
- workflow prompt assembly:
  - [packages/deep-research/src/prompts.ts](https://github.com/yai-dev/agentrail/blob/main/packages/deep-research/src/prompts.ts)

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

- `@agentrail/core`
- `@agentrail/capabilities` (orchestration)
- `@agentrail/app` (session stores, route factories)

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

## Integration Code

### Route Wiring

The deep-research example mounts two routes: one to start a run, one to query run state:

```ts
// examples/deep-research/src/routes/run.ts (simplified)
import { Hono } from "hono";
import { createDeepResearchRun } from "@agentrail/deep-research";
import { sessionStore, modelConfig, dataDir } from "../config.js";

const app = new Hono();

// Start a new research run
app.post("/run", async (c) => {
  const { query, tenantId, userId } = await c.req.json();
  const run = await createDeepResearchRun({
    query,
    tenantId,
    userId,
    sessionStore,
    modelConfig,
    dataDir,
  });
  return c.json({ runId: run.id, status: run.status });
});

// Stream progress events for a run
app.get("/run/:runId/stream", async (c) => {
  const { runId } = c.req.param();
  return streamRunEvents(c, runId);
});

// Query final artifacts and report
app.get("/run/:runId/result", async (c) => {
  const { runId } = c.req.param();
  const result = await getRunResult(runId);
  return c.json(result);
});
```

### Run Lifecycle

A deep research run moves through these phases:

```
query received
  -> normalize plan (LLM)
  -> spawn researcher sub-agents (one per topic)
  -> each researcher: search -> collect sources -> summarize
  -> source scoring and deduplication
  -> artifact generation
  -> report assembly
  -> run_complete
```

The coordinator drives this via the `OrchestrationManager`. Each phase produces orchestration events visible in the SSE stream.

### Consuming Progress Events

The client subscribes to the run's SSE stream and updates a research dashboard:

```ts
import type { AgentrailEvent } from "@agentrail/app";

async function subscribeToRun(runId: string, onUpdate: (patch: object) => void) {
  const response = await fetch(`/run/${runId}/stream`);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;

      const event = JSON.parse(raw) as AgentrailEvent;
      onUpdate(applyRunEvent(event));
    }
  }
}

function applyRunEvent(event: AgentrailEvent): object {
  switch (event.type) {
    case "orchestration_run_start":
      return { phase: "planning", runId: event.runId };
    case "subagent_spawned":
      return { phase: "researching", newAgent: event.agent };
    case "subagent_job_started":
      return { activeJob: { agentId: event.agentId, jobId: event.jobId } };
    case "subagent_job_completed":
      return { completedAgent: event.agentId };
    case "subagent_job_failed":
      return { failedAgent: event.agentId };
    case "orchestration_run_complete":
      return { phase: event.status === "completed" ? "done" : "failed" };
    default:
      return {};
  }
}
```

### Querying Run Results

Once `orchestration_run_complete` arrives, fetch the final artifacts:

```ts
const result = await fetch(`/run/${runId}/result`).then((r) => r.json());
console.log(result.report); // final Markdown report
console.log(result.sources); // scored and deduplicated sources
console.log(result.artifacts); // generated artifacts (tables, summaries)
```

---

## How To Use This Example

Use this example when you want to study:

- how to build a workflow package on top of Agentrail
- how orchestration-backed execution remains separate from hosted route glue
- how prompts, state, and reporting belong to a workflow package rather than the host app
- how to surface multi-agent progress to a client via orchestration events

If your app is "agent plus structured workflow" rather than "agent plus chat", this example is more relevant than the playground server.

## Related Docs

- [Architecture Overview](../architecture/README.md)
- [Concepts: Orchestration](../concepts/orchestration.md)
- [Concepts: Events](../concepts/events.md)
- [Reference: Events](../reference/events.md)
- [Examples: Playground Server](playground-server.md)
