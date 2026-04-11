# Use Capability Packages

Agentrail ships `@agentrail/capabilities` — a single package that bundles knowledge retrieval, sandboxed code execution, skills, orchestration, browser automation, and built-in tools. This guide shows how to wire capabilities into a hosted application.

## Prerequisites

Read this guide after:

- [Quickstart](quickstart.md)
- [Build a Profile](build-a-profile.md)
- [Add Tools](add-tools.md)
- [Add Context](add-context.md)

## How Capabilities Fit In

Capabilities follow a simple pattern:

1. Install `@agentrail/capabilities` (single package)
2. Instantiate any **Manager** singletons (e.g. `SandboxManager`, `KnowledgeManager`) at startup
3. Declare capabilities in your profile via `defineProfile({ capabilities: [...] })`

`createAgentApp` wires the context providers and tool builders automatically.

```bash
pnpm add @agentrail/capabilities
```

---

## Knowledge Base

The knowledge capability lets you index documents and make them searchable by the agent at request time.

### Instantiate KnowledgeManager

```ts
import { KnowledgeManager } from "@agentrail/capabilities";

export const knowledgeManager = new KnowledgeManager("/data/agentrail");
```

`KnowledgeManager` stores all knowledge bases under `{dataDir}/tenants/{tenantId}/knowledge_bases/`. Each KB is identified by a `kbId` string.

### Add to a Profile

```ts
import { defineProfile } from "@agentrail/app";
import { knowledge } from "@agentrail/capabilities";

export const researchProfile = defineProfile({
  id: "research",
  name: "Research Assistant",
  agent: {
    model: "anthropic:claude-sonnet-4-5",
    prompt: "You are a research assistant with access to the knowledge base.",
  },
  capabilities: [knowledge(knowledgeManager)],
});
```

At request time, the agent receives KB metadata summaries as context and gains access to `kb-list`, `kb-read`, and `kb-search`.

---

## Sandbox (Code Execution)

The sandbox capability provides Docker-backed isolated execution per session. It is required for code execution, file operations, filename discovery, bounded sleep/wait behavior, and browser tools.

### Instantiate SandboxManager

```ts
import { SandboxManager } from "@agentrail/capabilities";

export const sandboxManager = new SandboxManager("/data/agentrail", {
  image: "ghcr.io/yai-dev/agentrail-sandbox:latest",
  idleTimeoutMs: 30 * 60 * 1000,
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

### Add to a Profile

```ts
import { defineProfile } from "@agentrail/app";
import { filesystem } from "@agentrail/capabilities";

export const coderProfile = defineProfile({
  id: "coder",
  name: "Coder",
  agent: {
    model: "anthropic:claude-sonnet-4-5",
    prompt: "You are a coding assistant. You can run code in a sandbox.",
  },
  capabilities: [filesystem({ sandboxManager })],
});
```

Pass `sandboxManager` to `createAgentApp` as well so it is available during the request lifecycle:

```ts
const app = createAgentApp({
  dataDir: DATA_DIR,
  profiles: [coderProfile],
  sandboxManager,
});
```

### Graceful Shutdown

```ts
process.on("SIGTERM", async () => {
  await sandboxManager.destroyAll();
  process.exit(0);
});
```

---

## Skills

Skills are reusable agent capabilities defined as structured packages stored under `{dataDir}/skills/`.

### Instantiate SkillManager

```ts
import { SkillManager } from "@agentrail/capabilities";

export const skillManager = new SkillManager("/data/agentrail");
```

### Add to a Profile

```ts
import { defineProfile } from "@agentrail/app";
import { skills } from "@agentrail/capabilities";

export const assistantProfile = defineProfile({
  id: "assistant",
  name: "Assistant",
  agent: {
    model: "anthropic:claude-sonnet-4-5",
    prompt: "You are a helpful assistant.",
  },
  capabilities: [skills(skillManager, { mode: "delegate" })],
});
```

When `mode: "delegate"` is enabled, skill execution is isolated inside a sub-agent. This is the recommended setting for production use.

---

## Combining Multiple Capabilities

```ts
import { defineProfile } from "@agentrail/app";
import { filesystem, knowledge, skills } from "@agentrail/capabilities";

export const powerProfile = defineProfile({
  id: "power",
  name: "Power Assistant",
  agent: {
    model: "anthropic:claude-sonnet-4-5",
    prompt: "You are a powerful assistant.",
  },
  capabilities: [
    filesystem({ sandboxManager }),
    knowledge(knowledgeManager),
    skills(skillManager, { mode: "delegate" }),
  ],
});
```

## What Belongs Where

| Concern                           | Import from               |
| --------------------------------- | ------------------------- |
| Document search and retrieval     | `@agentrail/capabilities` |
| Code execution, file I/O, browser | `@agentrail/capabilities` |
| Reusable named agent capabilities | `@agentrail/capabilities` |
| Session history and compaction    | `@agentrail/app`          |

## Related Concepts

- [Context & Compaction](../concepts/context-and-compaction.md)
- [Agents](../concepts/agents.md)

## Related Guides

- [Add Tools Guide](add-tools.md)
- [Add Context Guide](add-context.md)
