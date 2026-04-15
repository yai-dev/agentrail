# 使用能力包

Agentrail 提供 `@agentrail/capabilities`。这是一个聚合包，包含知识检索、沙箱代码执行、skills、编排、浏览器自动化和内建工具。本页说明如何把这些 Capabilities 接入托管应用。

## 适用时机

建议在读完以下内容后阅读本页：

- [快速开始](./quickstart.md)
- [构建 Profile](./build-a-profile.md)
- [添加工具](./add-tools.md)
- [添加上下文](./add-context.md)

## Capability 如何接入

Capability 的接入模式比较统一：

1. 安装 `@agentrail/capabilities`
2. 在启动期初始化所需的 Manager 单例，例如 `SandboxManager`、`KnowledgeManager`
3. 在 Profile 中通过 `defineProfile({ capabilities: [...] })` 声明要暴露的能力

`createAgentApp` 会自动接好相关的 `Context Providers` 和 Tool Builders。

```bash
pnpm add @agentrail/capabilities
```

## 知识库

Knowledge Capability 用于索引文档，并在请求期为 Agent 提供检索能力。

### 初始化 `KnowledgeManager`

```ts
import { KnowledgeManager } from "@agentrail/capabilities";

export const knowledgeManager = new KnowledgeManager("/data/agentrail");
```

`KnowledgeManager` 会把所有知识库存储在 `{dataDir}/tenants/{tenantId}/knowledge_bases/` 下。每个知识库由一个 `kbId` 标识。

### 添加到 Profile

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

在请求期，Agent 会收到知识库元数据摘要，并可调用 `kb-list`、`kb-read`、`kb-search`。

## Sandbox 与代码执行

Sandbox Capability 提供基于 Docker 的隔离执行环境，并按 Session 隔离。代码执行、文件读写、文件名发现、受限等待，以及浏览器工具都依赖这一层。

### 初始化 `SandboxManager`

```ts
import { SandboxManager } from "@agentrail/capabilities";

export const sandboxManager = new SandboxManager("/data/agentrail", {
  image: "ghcr.io/yai-dev/agentrail-sandbox:latest",
  idleTimeoutMs: 30 * 60 * 1000,
});
```

`SandboxManager` 会为每个 Session 维护一个 Docker 容器。容器在首次使用时延迟创建，并在空闲超时后销毁。

### Docker 前提

sandbox 依赖：

- 服务进程可访问的 Docker daemon
- 已拉取或已本地构建的 sandbox 镜像

为避免首个请求额外等待，可在启动时预拉镜像：

```ts
void sandboxManager.ensureImage().catch((err) => {
  console.warn("[sandbox] Image pre-pull failed (will retry on first use):", err);
});
```

如果通过 Docker Compose 运行服务，需要挂载 Docker socket：

```yaml
services:
  server:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

### 添加到 Profile

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

同时也需要把 `sandboxManager` 传给 `createAgentApp`，这样它在请求生命周期内可用：

```ts
const app = createAgentApp({
  dataDir: DATA_DIR,
  profiles: [coderProfile],
  sandboxManager,
});
```

### 优雅退出

```ts
process.on("SIGTERM", async () => {
  await sandboxManager.destroyAll();
  process.exit(0);
});
```

## Skills

Skills 是一类可复用的 Agent 能力包，通常存储在 `{dataDir}/skills/` 下。

### 初始化 `SkillManager`

```ts
import { SkillManager } from "@agentrail/capabilities";

export const skillManager = new SkillManager("/data/agentrail");
```

### 添加到 Profile

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

当 `mode: "delegate"` 启用时，skill 会在子 Agent 中隔离执行。这是生产环境中的推荐模式。

## 组合多个 Capability

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

## 不同关注点分别属于哪里

| 关注点                     | 导入来源                  |
| -------------------------- | ------------------------- |
| 文档检索与读取             | `@agentrail/capabilities` |
| 代码执行、文件 I/O、浏览器 | `@agentrail/capabilities` |
| 可复用的命名 Agent 能力    | `@agentrail/capabilities` |
| Session 历史与压缩         | `@agentrail/app`          |

## 相关概念

- [上下文与压缩](../concepts/context-and-compaction.md)
- [Agent](../concepts/agents.md)

## 相关指南

- [添加工具](./add-tools.md)
- [添加上下文](./add-context.md)
