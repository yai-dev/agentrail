# 管理 Prompt

应通过 Prompt SDK 明确管理提示词的组装方式，并保持可复用。

## 适用时机

建议在读完以下内容后阅读本页：

- [快速开始](./quickstart.md)
- [构建 Profile](./build-a-profile.md)
- [Prompts（英文）](../../concepts/prompts.md)

如果每个 Profile 或 Workflow 都自己发明一套 Prompt 加载方式、文件格式和覆盖规则，维护成本会很快升高。Agentrail 提供 Prompt SDK，目的就是避免这类漂移。

## Prompt SDK 解决什么问题

如果缺少统一的 prompt 层，项目通常会逐渐变成以下几种做法的混合体：

- 把很长的 `System Prompt` 字符串直接写进 Route 文件
- 各自维护零散的 Markdown 加载辅助函数
- 元数据清理规则不一致
- 为不同模式复制多份 prompt 文件
- 基础行为与 Workflow 专用行为之间的覆盖规则不清楚

`@agentrail/core` 中的 Prompt SDK 试图用一套模型统一这些情况。

## 推荐结构

建议按以下方式理解 prompt 组织：

- `base`：通用行为
- `capability`：memory、knowledge、skills 等能力说明
- `profile`：某个 Agent 的身份与职责
- `workflow` 或 `mode`：某类专门模式

典型目录结构如下：

```text
src/prompts/
  base/
  capabilities/
  profiles/
  workflows/
```

项目起步时不一定需要完整目录，但当 prompt 开始增多时，最好尽早把这些类别分开。

## 核心构件

Prompt SDK 的核心构件包括：

- `definePromptFragment`
- `definePromptBundle`
- `createPromptBuilder`
- `loadPromptFile`
- `renderPrompt`

它们的职责可以这样理解：

- fragment：定义最小可复用单元
- bundle：定义有顺序的 prompt 集合
- builder：负责分层、缓存、变量与覆盖规则
- renderer：生成最终传给 Profile 或 Workflow 的 Prompt 文本

## 基于文件的 Prompt 示例

```ts
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPromptBuilder, definePromptBundle, definePromptFragment } from "@agentrail/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

const systemPromptBuilder = createPromptBuilder(
  definePromptBundle({
    base: {
      fragments: [
        definePromptFragment({
          key: "identity",
          filePath: join(__dirname, "system-prompt-identity.md"),
          stripMetadata: true,
        }),
        definePromptFragment({
          key: "behavior",
          filePath: join(__dirname, "system-prompt-behavior.md"),
          stripMetadata: true,
        }),
      ],
    },
  }),
);
```

playground 示例采用的就是这一风格：

- [examples/playground-server/src/prompts/index.ts](https://github.com/yai-dev/agentrail/blob/main/examples/playground-server/src/prompts/index.ts)

## 分层顺序

Agentrail 推荐的分层顺序是：

1. `base`
2. `capability`
3. `profile`
4. `mode` 或 `workflow`

这意味着：

- `base` 定义默认行为
- `capability` 说明 Host 或 Runtime 能做什么
- `profile` 定义该 Profile 的身份与任务
- `mode` 或 `workflow` 用于收窄到某个专门流程

这种分层方式的价值在于，它能帮助判断：

- 哪些 prompt 内容适用于所有地方
- 哪些只属于某个应用或 Profile
- 哪些只属于某个请求模式

## 变量

变量适合承载小规模的动态值，例如：

- 当前日期
- profile 名称
- 当前模式
- 环境提示

不要把变量当成真正组合能力的替代品。如果两个 prompt 在结构上已经明显不同，应该拆成不同 fragment 或 bundle，而不是把过多条件逻辑塞进模板。

## 归属规则

一个清楚的 prompt 归属模型通常是：

- 框架包负责框架级 prompt 基础设施
- Workflow 包负责 Workflow 角色 Prompt
- example 应用负责示例自己的 prompt 内容

也就是说，Prompt SDK 位于 `packages/core/src/prompts`，而实际 prompt 内容可以靠近拥有它的代码放置。

例如：

- Host Profile 的 Prompt 可与 Profile 放在一起
- deep research 这类 Workflow 包可在包内维护自己的角色 Prompt

## 仓库中的参考示例

当前仓库里的两个参考位置：

- playground 的托管 `System Prompt`：
  - [examples/playground-server/src/prompts/index.ts](https://github.com/yai-dev/agentrail/blob/main/examples/playground-server/src/prompts/index.ts)
- deep-research 的 Workflow Prompts：
  - [packages/deep-research/src/prompts.ts](https://github.com/yai-dev/agentrail/blob/main/packages/deep-research/src/prompts.ts)

这两个例子分别展示了：

- 托管 assistant Profile 的单个 bundle
- Workflow 包中的多角色 Prompt

## Prompt 审查清单

当 prompt 变得难以维护时，可先检查以下迹象：

- 一个文件承载了过多无关指令
- capability 说明直接混入 Workflow 专用 Prompt
- Profile 身份与 `mode` 专用行为在多处重复
- Route 或 Plugin 过度了解 Prompt 结构

通常更有效的修正方式，是重新拆分 fragment，而不是继续给一个巨大的 Prompt 字符串补注释。

## 建议

让 Prompt 文件尽量靠近拥有它的包或示例应用，同时用共享的 SDK 负责加载与渲染。

起步时可以保持简单，但 fragment 的身份最好尽早明确。这样后续做覆盖和复用时会轻很多。

## 下一步

当 Prompt 结构清楚后，下一步通常是把它接入托管 Profile：

- [构建 Profile](./build-a-profile.md)
- [Prompt SDK](../reference/prompt-sdk.md)
