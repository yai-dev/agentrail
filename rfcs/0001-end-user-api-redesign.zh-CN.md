# 最终用户 API 重设计

本文档是一份关于 Agentrail 未来 **官方最终用户 API** 的设计草案。

它是明确面向未来的。它 **不** 描述当前仓库中的包结构，也 **不** 描述当前已经存在的推荐集成方式。相反，它描述的是：当框架被整理收敛后，我们希望开发者第一时间学习到的那套 API 形态。

这份草案想回答一个具体问题：

> 如果我们围绕一个更干净的产品层重新设计 Agentrail，用户最终应该 import 什么、定义什么、组合什么？

## 为什么需要这份草案

Agentrail 现在已经具备了很强的内部能力：运行时执行、host 请求生命周期、session 存储、sandbox、skills、orchestration 等等。

当前的问题不是能力不够，而是实现层的形状泄漏到了第一次接触框架的开发者体验里。

一个第一次进入仓库的开发者，很容易被下面这些问题卡住：

- 我到底应该从哪些 API 开始？
- `agent` 和 `profile` 到底是什么关系？
- 我什么时候该用 `host/defaults`，什么时候该用 `host`？
- 哪些导出的类型属于真正的产品 API，哪些只是更底层的实现细节？

这份草案的目标，就是为框架提出一种更简单的公共语言。

## 核心模型

这次重设计建立在三个顶层概念之上：

### 1. Agent

`Agent` 是运行时执行单元。

它负责：

- 模型选择
- system prompt 或 prompt source
- 工具访问
- 运行时执行行为，例如 turn 限制

它 **不** 负责：

- 请求路由
- session 解析
- profile 选择
- app 层组合

运行时这一层应该保持小而明确。

### 2. Profile

`Profile` 是应用层的声明与组合单元。

它负责：

- 一个面向应用的 agent 入口的身份
- 请求到来时如何选择或创建 agent
- request-scoped 的 prompt 和 tool 组合
- 应用层 capability 启用

profile 不是 runtime agent。

这个区别非常重要，重要到公共 API 应该直接把它教给用户，而不是让用户从当前 host contract 里自己推断出来。

### 3. Capabilities

`Capabilities` 是应用层的官方扩展语言。

它回答的是这样一个问题：

> 这个 profile 能做什么？

开发者应该通过 capability 来理解这些能力：

- 文件系统访问
- 浏览器自动化
- 知识库检索
- skills
- orchestration
- memory 和上下文注入

在内部，这些能力仍然可以映射到 manager、tool factory、context provider 或 plugin。但最终用户层面的语言应该是 capability-first，而不是 package-first。

## 官方 API 应该给人的感觉

官方 API 应该读起来像一门小而清晰的产品语言，而不是对实现包的直接暴露。

从高层看，开发者应该能够这样理解 Agentrail：

1. 定义一个 agent
2. 定义一个 profile
3. 添加 capabilities
4. 创建一个 app

这就是本次重设计希望建立起来的学习路径。

## 提议中的最终用户 import 面

这份草案默认假设：Agentrail 应该暴露一套专门设计过、明确面向最终用户的 API 面，而不是继续要求新用户从当前实现层 package graph 中自己拼出心智模型。

一个合理的 import 结构可能会长这样：

- `@agentrail/core`
- `@agentrail/app`
- `@agentrail/capabilities`

这些名字目前仍然是草案名字。重点不在于名字本身，而在于：这套产品层应该按 **开发者意图** 来组织，而不是按内部子系统边界来组织。

### `@agentrail/core`

这一层负责运行时 essentials：

- `defineAgent(...)`
- `defineTool(...)`
- `Type`
- provider registration entrypoints

这个包应该只教授运行时语言，不承担更多职责。

### `@agentrail/app`

这一层负责应用层组合语言：

- `defineProfile(...)`
- `createProfileResolver(...)`
- `createAgentApp(...)`

这个包要回答的问题是：

> 我怎么把一个或多个 agents 作为托管应用暴露出去？

### `@agentrail/capabilities`

这一层负责应用层 capability 语言：

- `filesystem()`
- `browser()`
- `knowledge(...)`
- `skills(...)`
- `orchestration(...)`
- `memoryContext(...)`

这个包要回答的问题是：

> 这个 profile 应该具备哪些能力？

## 提议中的运行时 API

运行时 API 应该保持刻意的小。

```ts
import "@agentrail/core/providers";
import { defineAgent, defineTool, Type } from "@agentrail/core";

const weatherTool = defineTool({
  name: "get_weather",
  description: "Get the weather for a city.",
  parameters: Type.Object({
    city: Type.String(),
  }),
  async execute({ city }) {
    return {
      content: [{ type: "text", text: `${city}: sunny, 26C` }],
      details: { city, condition: "sunny", temperatureC: 26 },
    };
  },
});

const agent = defineAgent({
  id: "assistant",
  model: "openai:gpt-5.4",
  system: "You are a helpful assistant.",
  tools: [weatherTool],
});
```

### 运行时 API 说明

- `defineAgent(...)` 继续作为核心运行时 primitive。
- `defineTool(...)` 成为首推的对象式 tool API。
- 现有的 fluent `tool()` builder 可以保留，但不再作为第一屏教学路径。
- provider registry、default client 之类的低层类依然可以保留，但应该退出首屏学习体验。

## 提议中的 Profile API

应用层 API 应该围绕 `defineProfile(...)` 展开。

它有两种主要模式：

### 静态 profile 形态

```ts
import { defineProfile } from "@agentrail/app";

const assistantProfile = defineProfile({
  id: "assistant",
  name: "Assistant",
  agent: {
    model: "openai:gpt-5.4",
    prompt: "You are a helpful assistant.",
    tools: [],
  },
});
```

这是小而直接的 happy path。

### 动态 profile 形态

```ts
import { defineProfile } from "@agentrail/app";
import { defineAgent } from "@agentrail/core";

const assistantProfile = defineProfile({
  id: "assistant",
  name: "Assistant",
  async createAgent(context) {
    return defineAgent({
      id: "assistant-runtime",
      model: "openai:gpt-5.4",
      system: buildPrompt(context),
      tools: buildToolsForRequest(context),
    });
  },
});
```

这是 request-scoped 行为的高级路径。

### Profile 设计规则

这次重设计应该强制一些简单规则：

- `Profile` 和 `Agent` 是两个独立概念。
- 一个 profile 应该支持内联 `agent` 声明，或者支持 `createAgent(context)`，但两者的关系要清晰受约束。
- request-scoped 行为必须保持显式可见。
- profile API 的主要公共面里不应该再出现 `unknown` 这种模糊扩展位点。

## 提议中的 Capability API

capability 是应用层表达行为组合的方式。

一个使用 capabilities 的 profile 可能会写成这样：

```ts
import { defineProfile } from "@agentrail/app";
import {
  filesystem,
  browser,
  knowledge,
  skills,
  orchestration,
} from "@agentrail/capabilities";

const researchProfile = defineProfile({
  id: "research",
  name: "Research Assistant",
  agent: {
    model: "openai:gpt-5.4",
    prompt: "You can research, browse, and delegate work.",
  },
  capabilities: [
    filesystem(),
    browser(),
    knowledge(),
    skills({ mode: "delegate" }),
    orchestration(),
  ],
});
```

### Capability 设计规则

capability 应该具备这些特征：

- 显式
- 可组合
- 在 app 层以声明式方式表达
- 在内部映射到现有 tools、managers 或 context providers

capability **不应该** 变成一层魔法，把依赖和行为都藏起来，让用户不知道发生了什么。

### 第一批 capability 候选

#### `filesystem()`

由当前 sandboxed 文件与 shell tools 提供支持。

#### `browser()`

由当前浏览器自动化 tools 提供支持。

#### `knowledge(...)`

由当前 knowledge manager 和 KB tools 提供支持。

#### `skills(...)`

由当前 skill manager 和 skill tool builder 提供支持。

#### `orchestration(...)`

由当前 orchestration manager 和 orchestration tool factories 提供支持。

#### `memoryContext(...)`

由当前 memory index 和上下文注入路径提供支持。

## 提议中的 App API

托管应用入口应该围绕 `createAgentApp(...)` 展开。

一个最小形态可能会长这样：

```ts
import { createAgentApp, defineProfile } from "@agentrail/app";
import { filesystem } from "@agentrail/capabilities";

const assistant = defineProfile({
  id: "assistant",
  name: "Assistant",
  agent: {
    model: "openai:gpt-5.4",
    prompt: "You are a coding assistant.",
  },
  capabilities: [filesystem()],
});

const app = createAgentApp({
  dataDir: "./data",
  profiles: [assistant],
});
```

### App API 职责

`createAgentApp(...)` 应该负责：

- 组装 chat 和 stream routes
- 设置默认 session storage
- 在需要时设置默认 sandbox runtime
- 将 capabilities 接入到 profile 执行路径中
- 暴露一个清晰的 hosted-app 集成入口

### App API 非目标

app API 不应该：

- 把所有基础设施都完全隐藏起来
- 默认依赖全局 singleton
- 让挂载行为变成隐式魔法

目标不是剥夺控制权，而是让常见路径更短、更一致。

## 现有 packages 会发生什么

这次重设计 **不意味着** 当前 packages 会消失。

相反，它会让当前这些 packages 在心智模型里更容易被放在正确位置上。

### 哪些不变

- `runtime-core` 继续作为运行时实现层。
- `host` 继续作为低层 hosted lifecycle 层。
- `memo`、`sandbox`、`knowledge`、`skills`、`orchestration` 继续作为官方 API 背后的实现包存在。

### 哪些会改变

- 这些实现层 package 不再决定第一次接触框架的开发者体验。
- 官方 docs、脚手架和最小示例应该优先教授新 API。
- 现有低层 API 可以继续保留，但应该明确标记为 primitive、advanced 或 compatibility-oriented。

## 这份草案对当前 API 的含义

这份草案会直接影响现有公共命名。

### Profile 相关 API

当前围绕 `defineHostedProfile(...)` 和 `createHostedProfileResolver(...)` 的路径，和当前实现层结构绑定得过于紧了。

如果这次重设计继续推进：

- `defineProfile(...)` 会成为官方 app-level declaration API
- `createProfileResolver(...)` 会成为官方 resolver 概念
- 当前 hosted-profile 这条路径会被归类为 internal、advanced 或 compatibility-only

### Runtime tool API

当前的 `tool()` builder 可以继续保留，但它不应该继续作为默认的第一屏 tool 定义故事。

如果这次重设计继续推进：

- `defineTool(...)` 会成为首推产品 API
- `tool()` 会成为更低层的 builder API

### Route assembly API

当前的 `createChatRoute(...)` 和 `createStreamRoute(...)` 依然有价值，但它们过于细节化，不适合作为新用户第一次接触 hosted app 时看到的 API。

如果这次重设计继续推进：

- `createAgentApp(...)` 会成为默认 app entrypoint
- `createChatRoute(...)` 和 `createStreamRoute(...)` 继续作为 host primitives 存在

## 这对 docs 和 examples 意味着什么

如果 Agentrail 采纳这个方向，文档就不应该再先教实现层，再让用户自己推导产品层。

### 脚手架应该变化

`create-agentrail-app` 应该生成一个使用以下 API 的项目：

- 新的 runtime API
- 新的 profile API
- 新的 app API
- 新的 capability API

### 最小示例应该变化

docs 应该引入三类最小示例：

- 最小 runtime agent
- 最小 hosted app
- 最小 multi-agent app

### reference app 应该保留其角色

`playground-server` 和其他更丰富的例子依然应该保留，但需要明确地被展示为 reference implementation，而不是默认学习路径。

## 建议的实现顺序

如果这次重设计继续推进，实施顺序应该优先从产品面和示例开始，而不是先深入重写内部实现。

一个合理顺序是：

1. 定下官方 import 面
2. 定下 `defineProfile(...)`
3. 定下 capability descriptors
4. 定下 `createAgentApp(...)`
5. 增加 `defineTool(...)`
6. 迁移脚手架和最小示例
7. 重写 docs 和 package READMEs
8. 在 GA 前分类或清理 legacy entrypoints

这个顺序可以确保重设计是围绕真实开发者体验推进，而不是围绕抽象内部重构推进。

## 开放问题

这份草案刻意保留了一些尚未决定的问题。

### 包命名

`@agentrail/core`、`@agentrail/app`、`@agentrail/capabilities` 是最终名字，还是只是工作名？

### Profile 形态

`defineProfile(...)` 是否应该同时支持 `agent` 和 `createAgent(...)`？还是说其中一个应该被明显地作为主路径，而另一个进入 advanced-only？

### Capability 粒度

是否有些 capabilities 应该重新拆分或合并，尤其是在 memory、tools、orchestration 这些交界处？

### App entrypoint 输出形态

`createAgentApp(...)` 应该返回一个 Hono app、一个 route bundle，还是一个框架中立的对象，让不同 server layer 去挂载？

这些都是在正式实现前必须有意识做出的设计决策。

## 这份草案的定位

本文档不是 migration guide，也不是对当前公共 API 的说明。

它是一份提案：如果 Agentrail 要围绕更清晰的产品语言重设计，它最终应该向最终用户暴露怎样的 API 面。

如果这个方向被接受，下一步应该是把这份草案继续推进成具体的实现和迁移方案。
