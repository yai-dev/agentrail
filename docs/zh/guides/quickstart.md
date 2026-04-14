# 快速开始

本文给出一条最短可行路径，用于在 Agentrail 上启动一个可运行的托管 Agent 服务。

## 将得到什么

最终会得到一个最小化的 Hono 服务，它可以：

- 接收聊天请求
- 调用真实的 LLM Provider
- 通过 SSE 返回流式响应
- 将 Session 持久化到本地磁盘
- 在对话变长时自动执行上下文压缩

## 前置条件

- Node.js 22 或更高版本
- `pnpm`
- Anthropic 或 OpenAI 的 API Key

## 创建项目

最快的方式是直接使用脚手架：

```bash
pnpm dlx @agentrail/create-agentrail-app my-agent
cd my-agent
pnpm install
```

### 设置 API Key

脚手架会生成 `.env.example`。复制一份并填入实际值：

```bash
cp .env.example .env
```

编辑 `.env`：

```bash
MODEL_PROVIDER=anthropic
MODEL_ID=claude-3-5-sonnet-20241022
ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
```

不要把 API Key 写入 `agentrail.yaml`。统一使用环境变量。

### 启动服务

```bash
pnpm dev
```

### 用 `curl` 验证

```bash
curl -sN -X POST http://localhost:3000/api/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "What is Agentrail?", "tenantId": "dev", "userId": "user-1"}'
```

如果启动正常，可以看到持续返回的 SSE 事件，包括文本增量、工具调用、用量以及最终的 `done` 事件。

## 生成代码做了什么

脚手架默认生成两个核心文件。

### `src/agent.ts`

这里定义默认 Profile：

```ts
export const defaultProfile = defineProfile({
  id: AGENT_ID,
  name: "my-agent Agent",
  agent: {
    model: `${MODEL_PROVIDER}:${MODEL_ID}`,
    prompt: "You are a helpful assistant.",
  },
});
```

Profile 是 Host 层与运行时 Agent 之间的桥接点。它负责声明：

- Agent 标识
- 模型配置
- 系统提示词
- 可选工具与能力

同一个文件还会导出 `buildSummarizeFn`。当 Session 历史变长时，压缩流程会通过这个 summarizer 调用额外的 LLM 来总结旧消息。

### `src/main.ts`

入口文件会创建 `createAgentApp(...)`：

```ts
const agentApp = createAgentApp({
  dataDir: DATA_DIR,
  profiles: [defaultProfile],
  summarize: buildSummarizeFn(),
  compaction: { triggerTokens: 40_000, minMessages: 10 },
});

app.route("/api", agentApp);
```

它负责完整请求生命周期，包括 Session 处理、上下文组装、LLM 调用、工具调度、压缩与事件转发。

同时，入口文件会在启动时导入一次 `@agentrail/core/providers`，以注册内置的 Anthropic 与 OpenAI Providers。

## 手动搭建

如果不使用脚手架，也可以手动完成。

### 1. 安装依赖

```bash
mkdir my-agent && cd my-agent
pnpm init
pnpm add @agentrail/core @agentrail/app hono
pnpm add -D typescript tsx
```

### 2. 注册 LLM Providers

```ts
import "@agentrail/core/providers";
```

### 3. 定义 Profile

```ts
import { defineProfile } from "@agentrail/app";

const defaultProfile = defineProfile({
  id: "default",
  name: "Default Agent",
  agent: {
    model: "anthropic:claude-3-5-sonnet-20241022",
    prompt: "You are a helpful assistant.",
  },
});
```

### 4. 挂载 `createAgentApp`

```ts
import type { Message } from "@agentrail/core";
import { Hono } from "hono";
import { createAgentApp } from "@agentrail/app";

const summarize = async (messages: Message[]) =>
  messages.map((m) => `${m.role}: ${JSON.stringify(m.content)}`).join("\n");

const app = new Hono();

const agentApp = createAgentApp({
  dataDir: "/tmp/agentrail",
  profiles: [defaultProfile],
  summarize,
  compaction: { triggerTokens: 80_000, minMessages: 20 },
});

app.route("/api", agentApp);
```

### 5. 启动与测试

```bash
npx tsx main.ts
```

```bash
curl -sN -X POST http://localhost:3000/api/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "What is Agentrail?", "tenantId": "dev", "userId": "user-1"}'
```

## `/chat` 与 `/stream` 的区别

| 路径      | 返回形式 | 适合场景            |
| --------- | -------- | ------------------- |
| `/chat`   | JSON     | 简单 API、调试      |
| `/stream` | SSE      | 生产 UI、事件可视化 |

两条路由都会由 `createAgentApp` 自动挂载。若需要更细的控制，可以直接使用 `createChatRoute` 或 `createStreamRoute`。

## 下一步

建议继续阅读：

1. [构建 Profile](build-a-profile.md)
2. [Agent](../concepts/agents.md)
3. [工具](../concepts/tools.md)
4. [`createAgentApp` 参考](../reference/create-agent-app.md)
