# Use Capability Packages

Agentrail ships several optional capability packages — `@agentrail/knowledge`, `@agentrail/sandbox`, and `@agentrail/skills` — that provide structured data retrieval, isolated code execution, and reusable agent skills. This guide shows how to wire each one into a hosted application.

## Prerequisites

Read this guide after:

- [Quickstart](quickstart.md)
- [Build a Profile](build-a-profile.md)
- [Add Tools](add-tools.md)
- [Add Context](add-context.md)

## How Capability Packages Fit In

Each capability package follows the same pattern:

1. Instantiate a **Manager** (a singleton tied to `dataDir`) at startup
2. Pass the manager to **context providers** so the agent sees capability summaries on every request
3. Pass the manager to **tool builders** so the agent can invoke capability operations

The `@agentrail/host/defaults` layer provides helpers that do this wiring for you. You can also wire them manually if you prefer finer control.

---

## Knowledge Base (`@agentrail/knowledge`)

The knowledge package lets you index documents and make them searchable by the agent at request time.

### Instantiate KnowledgeManager

```ts
import { KnowledgeManager } from "@agentrail/knowledge";

export const knowledgeManager = new KnowledgeManager("/data/agentrail");
```

`KnowledgeManager` stores all knowledge bases under `{dataDir}/tenants/{tenantId}/knowledge_bases/`. Each KB is identified by a `kbId` string.

### How It Works

- **Ingestion**: Documents are indexed through an ingestion pipeline (`analyze → classify → summarize → index_update → register`). The playground server exposes API routes for managing KB ingestion.
- **Retrieval**: At request time, the agent uses KB search tools to query indexed content. KB metadata summaries can also be injected via context providers so the agent knows which KBs exist.

### Wire Into Context Providers

Use `createDefaultCapabilityContextProviders` or `createDefaultCapabilityTransformContext` to inject knowledge metadata into every request:

```ts
import { createDefaultCapabilityContextProviders } from "@agentrail/host/defaults";

const contextProviders = createDefaultCapabilityContextProviders({
  tenantId,
  userId,
  sessionId,
  listKnowledgeMetadatas: async () => {
    const kbIds = await knowledgeManager.listKbs(tenantId);
    return Promise.all(kbIds.map((id) => knowledgeManager.getMetadata(tenantId, id)));
  },
  // other providers...
});
```

This injects a summary of available knowledge bases before the conversation history on every request, so the agent knows what is searchable.

### Wire Into Tools

The KB search and management tools are assembled by `buildDefaultCapabilityTools` from `@agentrail/host/defaults`. Pass the `knowledgeManager` as part of the options:

```ts
import { buildDefaultCapabilityTools } from "@agentrail/host/defaults";

const { executionTools } = await buildDefaultCapabilityTools({
  tenantId,
  userId,
  sessionId,
  sessionDir,
  knowledgeManager,
  sandboxManager,
  waitHandleRegistry,
  modelConfig,
});
```

The assembled tools include `knowledge-search`, `knowledge-index`, and related KB management operations.

---

## Sandbox (`@agentrail/sandbox`)

The sandbox package provides Docker-backed isolated execution per session. It is required for code execution, file operations, and browser tools.

### Instantiate SandboxManager

```ts
import { SandboxManager } from "@agentrail/sandbox";

export const sandboxManager = new SandboxManager("/data/agentrail", {
  image: "ghcr.io/yai-dev/agentrail-sandbox:latest",
  idleTimeoutMs: 30 * 60 * 1000, // destroy container after 30 minutes idle
});
```

`SandboxManager` manages one Docker container per session. Containers are created lazily on first use and destroyed after the idle timeout.

### Docker Requirements

The sandbox requires:

- A running Docker daemon accessible from the server process
- The sandbox image pulled or built locally

Pre-pull the image at startup to avoid latency on first request:

```ts
void sandboxManager.ensureImage().catch((err) => {
  console.warn("[sandbox] Image pre-pull failed (will retry on first use):", err);
});
```

In Docker Compose, mount the Docker socket:

```yaml
services:
  server:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

### Workspace Snapshots in Context

The sandbox maintains a workspace directory per session. You can inject a workspace snapshot as context so the agent knows which files exist:

```ts
listWorkspaceSnapshot: () => sandboxManager.listWorkspace(sessionId),
```

Pass this to `createDefaultCapabilityContextProviders` alongside your other providers.

### Graceful Shutdown

Destroy all running containers on process exit:

```ts
process.on("SIGTERM", async () => {
  await sandboxManager.destroyAll();
  process.exit(0);
});
```

---

## Skills (`@agentrail/skills`)

Skills are reusable agent capabilities defined as structured packages stored under `{dataDir}/skills/`. Each skill has a `skill.json` config and an implementation that the agent can invoke.

### Instantiate SkillManager

```ts
import { SkillManager } from "@agentrail/skills";

export const skillManager = new SkillManager("/data/agentrail");
```

Skills are stored at `{dataDir}/skills/{skillName}/skill.json`. The `SkillManager` reads the skills directory and filters out any skill with `"enabled": false` in its config.

### Wire Into Context Providers

Inject the skills inventory as context so the agent knows which skills are available:

```ts
listSkills: () => skillManager.listSkills(),
```

Pass this to `createDefaultCapabilityContextProviders`.

### Wire Into Tools

Pass `skillManager` to `buildDefaultCapabilityTools`:

```ts
const { skillTool } = await buildDefaultCapabilityTools({
  // ...
  skillManager,
  includeSkillTool: true,
  delegateSkillsToSubAgent: true, // run skills in an isolated sub-agent
});
```

When `delegateSkillsToSubAgent` is `true`, skill execution is isolated inside a sub-agent. This is the recommended setting for production use.

---

## Using the Defaults Layer for All Three

The `buildDefaultCapabilityTools` function from `@agentrail/host/defaults` wires Knowledge, Sandbox, and Skills together into a single tool assembly call. This is the recommended path for most apps:

```ts
import { buildDefaultCapabilityTools } from "@agentrail/host/defaults";
import { KnowledgeManager } from "@agentrail/knowledge";
import { SandboxManager } from "@agentrail/sandbox";
import { SkillManager } from "@agentrail/skills";

// Process-level singletons
const knowledgeManager = new KnowledgeManager(dataDir);
const sandboxManager = new SandboxManager(dataDir, { image: config.sandbox.image });
const skillManager = new SkillManager(dataDir);

// Per-request tool assembly (inside createAgent or getTransformContext)
const { executionTools, browserTools, skillTool } = await buildDefaultCapabilityTools({
  tenantId,
  userId,
  sessionId,
  sessionDir,
  knowledgeManager,
  sandboxManager,
  skillManager,
  waitHandleRegistry,
  modelConfig,
  includeSkillTool: true,
  delegateSkillsToSubAgent: true,
});

const tools = [...executionTools, ...browserTools, ...(skillTool ? [skillTool] : [])];
```

Pass `tools` into `defineAgent` inside your profile's `createAgent` function.

## What Belongs Where

| Concern                           | Package                |
| --------------------------------- | ---------------------- |
| Document search and retrieval     | `@agentrail/knowledge` |
| Code execution, file I/O, browser | `@agentrail/sandbox`   |
| Reusable named agent capabilities | `@agentrail/skills`    |
| Session history and compaction    | `@agentrail/memo`      |

## Related Concepts

- [Tools](../concepts/tools.md)
- [Context & Compaction](../concepts/context-and-compaction.md)
- [Agents](../concepts/agents.md)

## Related Reference

- [Host Defaults Reference](../reference/host-defaults.md)
- [Add Tools Guide](add-tools.md)
- [Add Context Guide](add-context.md)
