# 架构总览

Agentrail 采用分层结构组织。理解各层职责，有助于判断代码应放在哪里，以及如何在不与框架结构冲突的前提下扩展能力。

## 技术栈

![Agentrail 架构图：从上到下依次为业务应用、`@agentrail/app` 与 `@agentrail/capabilities`、以及基础层 `@agentrail/core`。](/arch-diagram.svg)

这个结构由两个维度决定：

- 纵向维度「依赖方向」：每一层只依赖下层，不反向依赖。关系为 `core ← capabilities ← app`。
- 横向维度「组合方式」：`@agentrail/app` 不只是更高一层，也负责把 `@agentrail/capabilities` 与 `@agentrail/core` 组合成完整的托管请求生命周期。

## 分层说明

### 1. `@agentrail/core`

这是执行层基础。定义 Agent、工具契约 `defineTool`、LLM Provider 抽象、Agent Loop、消息类型、Prompt SDK、Session 类型契约与用量统计。

这一层不关心 HTTP、Session 存储或 Host 生命周期。

### 2. `@agentrail/capabilities`

这是可复用能力层，用于扩展 Agent 的可操作范围。当前包含：

- 基于 Docker 的文件系统与浏览器工具
- 知识库索引与检索
- 技能发现与执行
- 多 Agent 编排
- 通用工具，如 Web 搜索、提问、待办写入

这些能力可以通过 `defineProfile({ capabilities: [...] })` 注入到 Profile 中。

### 3. `@agentrail/app`

这是推荐的服务端接入层，负责：

- 通过 `createAgentApp` 提供 `/chat` 与 `/stream`
- 通过 `defineProfile` 定义 Profile
- Session 管理
- 插件与 Slash Command 扩展模型
- 类型化配置加载
- SSE 事件契约

对于托管场景，通常从这一层开始。

### 4. 业务应用

这一层是业务代码本身，包括 Profile、路由、UI 与业务逻辑。它依赖框架，但不属于框架的一部分。

## 包一览

| 包                                | 层级   | 用途                                                      |
| --------------------------------- | ------ | --------------------------------------------------------- |
| `@agentrail/core`                 | 1      | Agent Loop、工具契约、LLM Providers、Prompt、Session 类型 |
| `@agentrail/capabilities`         | 2      | Sandbox、知识库、技能、编排、内置工具                     |
| `@agentrail/app`                  | 3      | `createAgentApp`、`defineProfile`、Session、插件、配置    |
| `@agentrail/cli`                  | 工具   | 本地诊断与配置检查                                        |
| `@agentrail/testing`              | 工具   | 运行时与托管层测试辅助                                    |
| `@agentrail/deep-research`        | 附加包 | 多 Agent 深度研究工作流                                   |
| `@agentrail/create-agentrail-app` | 工具   | 项目脚手架                                                |

## 请求生命周期

当消息进入流式接口时，流程大致如下：

![Agentrail 请求生命周期：从 `POST /stream` 开始，经过 Session、Profile、历史记录、压缩、上下文组装、Agent 执行、持久化与结束。](/lifecycle-diagram.svg)

`/chat` 与 `/stream` 走的是同一套核心流程，区别在于前者返回聚合后的 JSON，后者按事件流式返回。

## 推荐入口与低层入口

Agentrail 明确区分「推荐入口」与「低层入口」。

推荐入口：

- `createAgentApp({ dataDir, profiles, ... })`
- `defineProfile(definition)`

低层入口：

- `createChatRoute(...)`
- `createStreamRoute(...)`
- `createOrchestrationRegistry(...)`

对于新项目，优先从 `createAgentApp` + `defineProfile` 开始。它们不是黑盒，而是一组已经组装好的推荐组合。随着应用复杂度上升，可以逐步拆开并替换其中的组件。

## 推荐阅读顺序

建议按以下顺序阅读：

1. [快速开始](../guides/quickstart.md)
2. [Agent](../concepts/agents.md)
3. [工具](../concepts/tools.md)
4. [构建 Profile](../guides/build-a-profile.md)
5. [`createAgentApp` 参考](../reference/create-agent-app.md)
6. [Playground Server 示例（英文）](/examples/playground-server)
