# Prompt SDK

`@agentrail/core` 提供一套共享的 Prompt 组装与加载模型，供 Profile、Sub-Agent 和 Workflow 包共同使用。

## 适用时机

当出现以下情况时，可先阅读本页：

- Prompt 已经不再适合用单个字符串维护
- 需要分层、文件加载或变量插值
- 希望在构建 Profile 之前先理解 Agentrail 的 Prompt 模型

这套 SDK 的目标很直接：让框架中的不同部分共用一套 Prompt 组装方式，而不是各自发明加载器。

## 核心类型

```ts
interface PromptFragment {
  key: string;
  content?: string;
  filePath?: string;
  stripMetadata?: boolean;
}

interface PromptLayer {
  fragments?: PromptFragment[];
  replace?: Record<string, PromptFragment>;
  vars?: PromptVars;
}

interface PromptBundle {
  vars?: PromptVars;
  base?: PromptLayer;
  capability?: PromptLayer;
  profile?: PromptLayer;
  mode?: PromptLayer;
}

type PromptVars = Record<string, string | number | boolean | null | undefined>;
type PromptLayerName = "base" | "capability" | "profile" | "mode";
```

渲染顺序固定为：`base → capability → profile → mode`。每一层的 fragments 会用双换行拼接。

## 主要 API

### `definePromptFragment`

定义一个具名 Prompt Fragment。这个函数本身不会改写输入，主要用于类型安全与 IDE 自动补全。

```ts
import { definePromptFragment } from "@agentrail/core";

export const baseInstructions = definePromptFragment({
  key: "base.instructions",
  content: `
You are a helpful AI assistant. Be concise, accurate, and professional.
When uncertain, ask clarifying questions rather than guessing.
  `.trim(),
});

export const safetyRules = definePromptFragment({
  key: "base.safety",
  filePath: new URL("./safety.md", import.meta.url).pathname,
  stripMetadata: true,
});

export const personaFragment = definePromptFragment({
  key: "profile.persona",
  content: "Your name is ${agentName}. Your role is ${role}.",
});
```

### `definePromptBundle`

定义一个跨四层的有序 Prompt Bundle：

```ts
import { definePromptBundle } from "@agentrail/core";
import { baseInstructions, safetyRules, personaFragment } from "./fragments.js";

export const supportBundle = definePromptBundle({
  vars: {
    agentName: "Support Agent",
    role: "customer support assistant",
  },
  base: {
    fragments: [baseInstructions, safetyRules],
  },
  capability: {
    fragments: [
      definePromptFragment({
        key: "capability.tools",
        content: "You have access to file editing and search tools.",
      }),
    ],
  },
  profile: {
    fragments: [personaFragment],
  },
});
```

### `createPromptBuilder`

基于某个 Bundle 创建 `PromptBuilder`。Builder 内部持有自己的 `PromptLoader` 缓存，实例之间互不共享状态。

```ts
import { createPromptBuilder } from "@agentrail/core";
import { supportBundle } from "./prompts/support-bundle.js";

const builder = createPromptBuilder(supportBundle);

const system = builder.render();

const systemWithContext = builder.render({
  vars: {
    agentName: "Alex",
    role: "senior support specialist",
  },
});

const systemWithMode = builder.render({
  overlay: {
    mode: {
      fragments: [
        definePromptFragment({
          key: "mode.research",
          content: "Focus only on technical documentation questions.",
        }),
      ],
    },
  },
});
```

`PromptBuilder` 接口如下：

```ts
interface PromptBuilder {
  render(options?: { vars?: PromptVars; overlay?: PromptBundle; bundle?: PromptBundle }): string;
  clearCache(): void;
}
```

### `renderPrompt`

这是一个独立函数，用于对普通字符串里的 `${variable}` 做插值：

```ts
import { renderPrompt } from "@agentrail/core";

const template = "Hello, ${name}! You are working on ${project}.";
const rendered = renderPrompt(template, { name: "Alice", project: "Agentrail" });
```

变量语法为 `${key}`，其中 `key` 需匹配 `[A-Za-z0-9_]+`。值会被转成字符串；`null` 与 `undefined` 会变成空字符串。

### `loadPromptFile`（已弃用）

> 已弃用。`loadPromptFile` 使用模块级单例缓存，会在测试运行和独立实例之间泄漏状态。现在应改用 `createPromptBuilder`。

迁移方式：

```ts
import { createPromptBuilder, definePromptBundle } from "@agentrail/core";

const builder = createPromptBuilder(
  definePromptBundle({
    base: {
      fragments: [{ key: "main", filePath: "/path/to/system.md" }],
    },
  }),
);

const text = builder.render();
```

## 端到端示例

下面是一套可用于托管 Profile 的完整 Prompt 结构：

```ts
// prompts/fragments.ts
import { definePromptFragment } from "@agentrail/core";

export const behaviorFragment = definePromptFragment({
  key: "base.behavior",
  content: `
You are a concise, accurate assistant.
Never guess — ask for clarification when uncertain.
Today's date is \${currentDate}.
  `.trim(),
});

export const toolsFragment = definePromptFragment({
  key: "capability.tools",
  content: "You can read and write files using the provided file tools.",
});

export const personaFragment = definePromptFragment({
  key: "profile.persona",
  filePath: new URL("./persona.md", import.meta.url).pathname,
});
```

```ts
// prompts/bundle.ts
import { definePromptBundle } from "@agentrail/core";
import { behaviorFragment, toolsFragment, personaFragment } from "./fragments.js";

export const agentBundle = definePromptBundle({
  vars: { currentDate: new Date().toISOString().slice(0, 10) },
  base: { fragments: [behaviorFragment] },
  capability: { fragments: [toolsFragment] },
  profile: { fragments: [personaFragment] },
});
```

```ts
// profiles/my-profile.ts
import { createPromptBuilder } from "@agentrail/core";
import { defineProfile } from "@agentrail/app";
import { agentBundle } from "../prompts/bundle.js";

export const myProfile = defineProfile({
  id: "default",
  name: "Default Agent",
  agent: {
    model: "anthropic:claude-sonnet-4-5",
    prompt: () => {
      const builder = createPromptBuilder(agentBundle);
      return builder.render({
        vars: { currentDate: new Date().toISOString().slice(0, 10) },
      });
    },
  },
});
```

## 分层策略

四层模型各自承担不同职责：

| 层           | 用途              | 常见内容                           |
| ------------ | ----------------- | ---------------------------------- |
| `base`       | 通用行为规则      | 安全约束、输出格式、不确定性处理   |
| `capability` | 可用能力说明      | 文件工具、知识库、skills           |
| `profile`    | 角色、身份、任务  | 某个支持 Agent 或研究 Agent 的职责 |
| `mode`       | Workflow 专用收窄 | 只关注研究阶段、只做归纳阶段       |

Workflow 包通常只覆盖 `mode` 层，而不改动 `base` 或 `profile`。

## 推荐的文件组织方式

```text
prompts/
  fragments/
    behavior.ts
    tools.ts
    safety.md
  profiles/
    support.ts
    researcher.ts
  bundles/
    support-bundle.ts
    researcher-bundle.ts
```

一般建议每个托管 Profile 或 Workflow 角色对应一个 Bundle，并让 Fragment 文件保持小而聚焦。

## 不建议的做法

- 用一个巨大的 System Prompt 字符串承载所有内容
- 并存多套互不兼容的 Prompt Loader
- 把 Prompt 直接写进 Route 文件
- 在多个请求之间共享同一个 `PromptBuilder` 实例

## 相关文档

- [Prompts（英文）](../../concepts/prompts.md)
- [管理 Prompt](../guides/manage-prompts.md)
- [构建 Profile](../guides/build-a-profile.md)

## 说明

本页覆盖了 Prompt SDK 的核心类型、主要 API 与推荐组织方式。若需要逐段对照完整英文内容，可继续阅读 [英文原文](../../reference/prompt-sdk.md)。
